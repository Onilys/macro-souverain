# Type Alias: CreateAiCreditCheckoutErrors

> **CreateAiCreditCheckoutErrors** = `object`

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-400"></a> `400` | [`AiBillingErrorBody`](AiBillingErrorBody.md) | Invalid pack, untrusted return URL, or no payment account |
| <a id="property-401"></a> `401` | `unknown` | Unauthorized |
| <a id="property-402"></a> `402` | [`AiBillingErrorBody`](AiBillingErrorBody.md) | A paid plan is required |
| <a id="property-403"></a> `403` | [`AiBillingErrorBody`](AiBillingErrorBody.md) | Only the payer may buy credits |
| <a id="property-500"></a> `500` | [`AiBillingErrorBody`](AiBillingErrorBody.md) | Internal server error |
