# Type Alias: SsoLoginData

> **SsoLoginData** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path?` | `never` | - |
| <a id="property-query"></a> `query` | `object` | - |
| `query.idp_id` | `string` | **OPTIONAL**. The idp id of the identity provider to use for login. |
| `query.idp_name` | `string` | The name of the identity provider to use for login. e.g Google |
| `query.is_mobile` | `string` | **OPTIONAL**. If the authentication request is from a mobile device. |
| `query.login_hint` | `string` | **OPTIONAL**. The user's email. |
| `query.original_url` | `string` | **OPTIONAL**. The original url you came from. |
| `query.referral_code` | `string` | **OPTIONAL**. If the user opened a link with a referral code. |
| <a id="property-url"></a> `url` | `"/login/sso"` | - |
