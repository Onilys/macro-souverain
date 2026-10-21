# Macro Plugin Package for OpenAI ChatGPT

This directory contains the plugin package for submitting Macro's MCP server to the OpenAI ChatGPT Apps Directory.

## Package Structure

```
openai-plugin-package/
├── plugin.json          # Portable Agent Plugins manifest
├── mcp.json            # MCP server configuration
├── assets/             # Icon assets
│   ├── icon.svg        # SVG icon (any size)
│   ├── icon-512.png    # 512x512px PNG icon
│   ├── icon-256.png    # 256x256px PNG icon
│   └── icon-128.png    # 128x128px PNG icon
├── README.md           # This file
└── build-package.sh    # Script to build the submission ZIP
```

## Building the Submission ZIP

Run the build script to create the submission ZIP:

```bash
cd /workspace/services/mcp_service/openai-plugin-package
./build-package.sh
```

This creates `macro-plugin-v1.0.0.zip` in the parent directory, ready for upload to the OpenAI submission portal.

## Configuration Values

### Plugin Metadata
- **Name**: macro
- **Display Name**: Macro
- **Version**: 1.0.0
- **Category**: productivity
- **Developer**: Macro (must be set in OpenAI portal)

### URLs
- **Website**: https://macro.com
- **Support**: https://docs.macro.com/support
- **Privacy Policy**: https://macro.com/privacy
- **Terms of Service**: https://macro.com/terms

### MCP Server
- **URL**: https://mcp-server.macro.com/mcp
- **Transport**: Streamable HTTP (SSE)
- **Authentication**: OAuth 2.1 (configured in portal, not in package)

## Domain Verification

The MCP server must serve the OpenAI domain verification token at:
```
https://mcp-server.macro.com/.well-known/openai-apps-challenge
```

**Setting the token:**
1. Obtain the challenge token from the OpenAI submission portal
2. Set it in the appropriate environment configuration:
   - **Development**: Set `OPENAI_DOMAIN_VERIFICATION_TOKEN` in Doppler for the `mcp-server` project, `dev` config
   - **Production**: Set `OPENAI_DOMAIN_VERIFICATION_TOKEN` in Doppler for the `mcp-server` project, `prod` config
3. Redeploy the service (ECS service will pick up the new env var automatically)
4. Verify the token is accessible: `curl https://mcp-server.macro.com/.well-known/openai-apps-challenge`

**Deployment Flow:**
1. Token obtained from OpenAI portal → 
2. Set in Doppler for mcp-server service → 
3. Doppler injects env var into ECS task → 
4. `src/main.rs` `openai_domain_verification()` handler returns the token → 
5. OpenAI portal verifies domain ownership

## OAuth Configuration

OAuth is configured in the OpenAI submission portal, not in this package:
- **Client Secret**: Entered directly in the portal (not in mcp.json)
- **Authorization Endpoint**: `https://auth.macro.com/oauth2/authorize`
- **Token Endpoint**: `https://auth.macro.com/oauth2/token`
- **Scopes**: Full workspace access (default OAuth flow)

The MCP server's `mcp_auth_proxy` handles the OAuth flow with FusionAuth.

## Assets

Icon assets are required in multiple sizes:
- **SVG**: Vector icon (any size, scalable)
- **512x512px**: High-resolution PNG
- **256x256px**: Medium-resolution PNG
- **128x128px**: Low-resolution PNG

Source assets are in `/workspace/apps/web/public/macro-favicon.svg`. 

**TODO**: Export the favicon to PNG in required sizes and place in `assets/` directory.

## Submission Checklist

Before submitting the plugin ZIP to OpenAI:

- [ ] **Icon Assets**: Export and add icon-512.png, icon-256.png, icon-128.png to assets/
- [ ] **Build ZIP**: Run `./build-package.sh` to create the submission ZIP
- [ ] **Organization Verification**: Complete business verification in OpenAI Platform Dashboard
- [ ] **Developer Name**: Set "Macro" as the developer name in the portal
- [ ] **Domain Verification Token**: Obtain token from portal and set in Doppler
- [ ] **Deploy with Token**: Redeploy mcp_service to prod with the verification token
- [ ] **Verify Domain**: Confirm token is accessible at /.well-known/openai-apps-challenge
- [ ] **OAuth Secret**: Enter FusionAuth client secret in the portal
- [ ] **Test Credentials**: Create demo account with sample data (no MFA)
- [ ] **Upload ZIP**: Upload macro-plugin-v1.0.0.zip to OpenAI portal
- [ ] **Portal Scan**: Run "Scan Tools" in the portal to validate
- [ ] **Submit for Review**: Complete all portal fields and submit

## Testing Locally

To test the plugin package locally before submission:

1. Install it in ChatGPT Desktop or Codex CLI
2. Complete the OAuth flow when prompted
3. Test example prompts:
   - "Search my workspace for documents about Q4 planning"
   - "Create a new document called 'Meeting Notes'"
   - "What are the latest messages in the #engineering channel?"
   - "Show me upcoming calendar events"

## Support

For questions about the plugin submission:
- **Technical Lead**: Eric Hayes (eric@macro.com, GitHub: ehayes2000)
- **Company Support**: support@macro.com
- **Documentation**: https://docs.macro.com/AI/mcp/overview
