import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { Lambda } from '../../packages/lambda';
import { CLOUD_TRAIL_SNS_TOPIC_ARN, stack } from '../../packages/shared';

const BASE_NAME = 'notification_retention_handler';
const REPO_ROOT = '../../..';

type RetentionEnvVars = {
  DATABASE_URL: pulumi.Output<string> | string;
  ENVIRONMENT: string;
  RUST_LOG: string;
};

type Args = {
  databaseUrl: pulumi.Output<string>;
  enabled: boolean;
  dryRun: boolean;
  vpc: {
    vpcId: pulumi.Output<string> | string;
    publicSubnetIds: pulumi.Output<string[]> | string[];
    privateSubnetIds: pulumi.Output<string[]> | string[];
  };
  tags: Record<string, string>;
};

/** Isolated maintenance worker: disabled initially, then preview before deleting. */
export class NotificationRetention extends pulumi.ComponentResource {
  readonly lambda: aws.lambda.Function;

  constructor(
    name: string,
    args: Args,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super('macro:notifications:Retention', name, {}, opts);
    const { databaseUrl, enabled, dryRun, vpc, tags } = args;
    const role = new aws.iam.Role(
      `${BASE_NAME}-role`,
      {
        assumeRolePolicy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            },
          ],
        }),
        managedPolicyArns: [
          aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
          aws.iam.ManagedPolicy.AWSLambdaVPCAccessExecutionRole,
        ],
        tags,
      },
      { parent: this }
    );
    this.lambda = new Lambda<RetentionEnvVars>(
      `${BASE_NAME}-lambda`,
      {
        baseName: BASE_NAME,
        handlerBase: `${REPO_ROOT}/services/${BASE_NAME}`,
        zipLocation: `${REPO_ROOT}/target/lambda/${BASE_NAME}/bootstrap.zip`,
        envVars: {
          DATABASE_URL: databaseUrl,
          ENVIRONMENT: stack,
          RUST_LOG: 'info',
        },
        role,
        vpc,
        memorySize: 256,
        timeout: 120,
        reservedConcurrentExecutions: 1,
        tags,
      },
      { parent: this }
    ).lambda;

    const rule = new aws.cloudwatch.EventRule(
      `${BASE_NAME}-schedule`,
      {
        scheduleExpression: 'rate(5 minutes)',
        state: enabled ? 'ENABLED' : 'DISABLED',
        tags,
      },
      { parent: this }
    );
    new aws.cloudwatch.EventTarget(
      `${BASE_NAME}-target`,
      {
        rule: rule.name,
        arn: this.lambda.arn,
        input: JSON.stringify({ dry_run: dryRun }),
        retryPolicy: { maximumEventAgeInSeconds: 60, maximumRetryAttempts: 0 },
      },
      { parent: this }
    );
    new aws.lambda.Permission(
      `${BASE_NAME}-invoke`,
      {
        action: 'lambda:InvokeFunction',
        function: this.lambda.name,
        principal: 'events.amazonaws.com',
        sourceArn: rule.arn,
      },
      { parent: this }
    );
    // The next scheduled sweep retries any outstanding rows. Don't accumulate
    // asynchronous retries of an old invocation while the worker is throttled.
    new aws.lambda.FunctionEventInvokeConfig(
      `${BASE_NAME}-async-policy`,
      {
        functionName: this.lambda.name,
        maximumEventAgeInSeconds: 60,
        maximumRetryAttempts: 0,
      },
      { parent: this }
    );
    for (const metricName of ['Errors', 'Throttles']) {
      new aws.cloudwatch.MetricAlarm(
        `${BASE_NAME}-${metricName.toLowerCase()}`,
        {
          namespace: 'AWS/Lambda',
          metricName,
          dimensions: { FunctionName: this.lambda.name },
          statistic: 'Sum',
          period: 300,
          evaluationPeriods: 1,
          threshold: 1,
          comparisonOperator: 'GreaterThanOrEqualToThreshold',
          treatMissingData: 'notBreaching',
          alarmActions: [CLOUD_TRAIL_SNS_TOPIC_ARN],
          tags,
        },
        { parent: this }
      );
    }
    new aws.cloudwatch.MetricAlarm(
      `${BASE_NAME}-missing-invocations`,
      {
        namespace: 'AWS/Lambda',
        metricName: 'Invocations',
        dimensions: { FunctionName: this.lambda.name },
        statistic: 'Sum',
        period: 900,
        evaluationPeriods: 1,
        threshold: 1,
        comparisonOperator: 'LessThanThreshold',
        treatMissingData: enabled ? 'breaching' : 'notBreaching',
        actionsEnabled: enabled,
        alarmActions: [CLOUD_TRAIL_SNS_TOPIC_ARN],
        tags,
      },
      { parent: this }
    );
  }
}
