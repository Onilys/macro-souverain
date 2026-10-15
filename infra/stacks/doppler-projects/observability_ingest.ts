import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as doppler from '@pulumiverse/doppler';

// Read the existing source; never manage or generate the token in Pulumi.
const source = doppler.Secret.get(
  'observability-otlp-token',
  'observability.prd.OTLP_TOKEN',
  undefined,
  { additionalSecretOutputs: ['value', 'computed'] }
);

// Keep the existing raw-string secret and its ARN for ECS and GitHub OIDC.
// The observability host is in Ohio, but this consumer copy is in Virginia.
if (aws.config.requireRegion() !== 'us-east-1') {
  throw new Error('The ingestion token copy must stay in us-east-1');
}
const destination = aws.secretsmanager.getSecretOutput({
  name: 'observability/dev-ingest',
});

// Import AWSCURRENT before the first update (see OBSERVABILITY_INGEST.md).
// This is deployment-time synchronization, not a background Doppler native sync.
new aws.secretsmanager.SecretVersion(
  'observability-dev-ingest',
  {
    secretId: destination.arn.apply((arn) => {
      if (
        !arn.startsWith(
          'arn:aws:secretsmanager:us-east-1:569036502058:secret:observability/dev-ingest-'
        )
      ) {
        throw new Error('Unexpected ingestion secret account or path');
      }
      return arn;
    }),
    secretString: pulumi.secret(source.computed).apply((token) => {
      if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
        throw new Error(
          'OTLP_TOKEN must be a URL-safe token of at least 32 characters'
        );
      }
      return token;
    }),
    versionStages: ['AWSCURRENT'],
  },
  {
    // Rotations replace this resource. Keep previous versions for rollback.
    retainOnDelete: true,
  }
);
