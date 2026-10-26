# Macro souverain — un seul serveur, aucune dépendance cloud, sans IA

Ce fork (`Onilys/macro-souverain`) adapte Macro pour tourner sur **un serveur
unique hébergé en local**, sans AWS, sans Cloudflare, sans SaaS américain et
**sans aucune fonction d'IA**. Ce document est la référence de la migration :
décisions, architecture cible, phases et état d'avancement.

## Décisions

| Sujet | Choix |
| --- | --- |
| Hébergement | Serveur local unique (Docker Compose), reverse proxy Caddy |
| IA | **Aucune** : fonctions d'IA coupées dans le code, masquées dans l'interface et bloquées au réseau |
| E-mail | Nouveau fournisseur IMAP/SMTP ; Gmail et Outlook désactivés |
| Code | Fork public `Onilys/macro-souverain`, licence AGPLv3 conservée |

**AGPLv3** : utilisation interne libre. Si des tiers (clients, partenaires)
accèdent à l'instance, ils doivent pouvoir obtenir le code source modifié ; le
fork public y répond.

## Architecture cible

```
                     ┌──────────────── serveur unique ────────────────┐
navigateur ── HTTPS ─┤ Caddy (TLS, routage /auth /dss /sync …, front)  │
                     │  ├─ services Rust (auth, documents, mail, …)     │
                     │  ├─ sync-service (workerd, CRDT Loro)            │
                     │  ├─ FusionAuth (Community, auto-hébergé)         │
                     │  ├─ Postgres · Redis · Kafka · OpenSearch        │
                     │  ├─ Garage (S3) · ElasticMQ (SQS) · local-kms    │
                     │  ├─ supercronic (tâches planifiées)              │
                     │  ├─ LiveKit server (appels, sans transcription)  │
                     │  └─ relais SMTP · LGTM (observabilité)           │
                     └── pare-feu sortant : liste blanche ─────────────┘
```

## Remplacements

| Dépendance actuelle | Remplacement | Effort |
| --- | --- | --- |
| S3 | Garage (FR, AGPL), compatible S3 | config |
| SQS (FIFO, délais, redrive) | ElasticMQ | config |
| DynamoDB (4 tables simples) | DynamoDB Local d'abord, puis Postgres | config → code |
| KMS | local-kms (persistant) | config |
| Secrets Manager | variables d'environnement (`ENVIRONMENT=local` le contourne déjà) | aucun |
| SES | SMTP (déjà pris en charge par `ses_client`, à étendre à `notification_service`) | code |
| SNS (push mobile) | désactivé : web et ordinateur uniquement | config |
| Lambda + EventBridge (~20 tâches) | workers longue durée + supercronic | code |
| CloudFront (URL signées) | URL S3 présignées derrière Caddy | code |
| Cloudflare Worker sync-service | workerd sur le serveur | config |
| Doppler | fichier d'environnement | aucun |
| LiveKit Cloud | LiveKit server, sans agent de transcription | config |
| Fournisseurs d'IA (Anthropic, OpenAI, Google, Cerebras, Fireworks, Cohere, TypeSafe, Deepgram) | **supprimés** (voir « Sans IA ») | en cours |
| PostHog, Google Analytics, Meta Pixel, Datadog | supprimés ; LGTM pour l'observabilité | code |
| Gmail / Outlook | IMAP/SMTP | code (gros) |
| Stripe, Apollo, Pipedream, Daytona, agents cloud | désactivés | config |

## Sans IA

Trois couches indépendantes : chacune suffit à empêcher l'envoi de contenu à un
fournisseur d'IA.

1. **Code** : `AI_DISABLED=true` fait échouer le routeur de modèles
   (`crates/agent`) avant toute requête. Cela couvre le chat, les agents, la
   mémoire, les projections, les bots de canal, les résumés d'appel, l'import
   Notion et le juge de doublons de tâches.
2. **Réseau** : les domaines des fournisseurs sont redirigés vers `0.0.0.0` dans
   tous les conteneurs (`extra_hosts`), et le pare-feu du serveur refuse toute
   sortie hors liste blanche (serveurs IMAP/SMTP, mises à jour système). Cela
   couvre aussi les appels directs qui ne passent pas par le routeur :
   embeddings et rerank des tâches, dictée Whisper, outils serveur Anthropic,
   proxy `/chat/completions`.
3. **Interface** : un drapeau web `VITE_DISABLE_AI` masque toutes les entrées
   d'IA (navigation Agents, chat d'accueil, boutons « Ask AI », mention
   `@macro`, routines, filtre IA des tâches, résumé d'appel, onglets de
   réglages, étape d'onboarding).

Services d'IA **non déployés** : `agent_harness_service`, `agent_trigger_service`,
`scheduled_action` (routines), `ai-editing-worker`, `mcp_service`,
`mcp_auth_proxy`, `preview_gateway`, `coding-agent-worker`, `transcription`,
`ai_projections_refresh_handler`. `document_cognition_service` **reste** : il
porte aussi l'onboarding et des listes de l'interface.

Variables d'environnement :

```env
AI_DISABLED=true
VITE_DISABLE_AI=true
# Valeurs factices : certains services refusent de démarrer sans elles ;
# aucun appel n'aboutit (routeur coupé, domaines bloqués).
ANTHROPIC_API_KEY=disabled
OPENAI_API_KEY=disabled
COHERE_API_KEY=disabled
CEREBRAS_API_KEY=disabled
FIREWORK_API_KEY=disabled
GOOGLE_GENERATIVE_AI_API_KEY=disabled
# Jamais l'URL par défaut, qui pointe vers le worker hébergé de Macro.
AI_EDITING_WORKER_URL=http://disabled.invalid
VITE_AI_EDITING_WORKER_URL=http://disabled.invalid
# Laisser vides : LIVEKIT_TRANSCRIPTION_AGENT_NAME, TYPESAFE_API_KEY, APOLLO_API_KEY
USE_APOLLO_CRM_ENRICHMENT=false
```

## Matériel

Sans IA, pas de carte graphique : 16 cœurs, 64 Go de RAM (OpenSearch, Kafka,
Postgres et une vingtaine de conteneurs), NVMe de 1 To, plus une sauvegarde
externe.

## Phases

| # | Phase | Contenu | État |
| --- | --- | --- | --- |
| 0 | Socle | Nix + Docker sur le serveur ; `just run_local --no-doppler` démarre ; tests des commits du fork | à faire (accès serveur) |
| 1 | Infra souveraine | Garage, ElasticMQ, local-kms, DynamoDB Local ; passerelle AWS unique ; mode « auto-hébergé » distinct de `ENVIRONMENT=local` (pas d'auto-connexion de dev) ; Caddy + domaine ; pare-feu sortant ; sauvegardes | à faire |
| 2 | Sortie d'AWS côté code | SMTP pour les notifications ; push désactivé ; URL signées sans CloudFront ; Lambdas → workers ; tâches planifiées | à faire |
| 3 | Sans IA | Routeur coupé par `AI_DISABLED` ✅ ; blocage réseau ; drapeau web `VITE_DISABLE_AI` ; services d'IA retirés du déploiement | en cours |
| 4 | Front et domaine | Domaine propre ; suppression des traceurs ; drapeaux de fonctionnalité statiques ; CORS, cookies, domaine d'expéditeur | à faire |
| 5 | IMAP/SMTP | Adaptateur sur le moteur de messagerie générique (créé pour Outlook) ; coffre d'identifiants chiffrés ; formulaire de connexion | à faire |
| 6 | Exploitation | Supervision (LGTM), mises à jour depuis l'amont, procédure de restauration | à faire |

## Ce qui reste hors périmètre

- **Applications mobiles iOS/Android** : le push passe forcément par Apple et
  Google ; l'instance vise le web et l'application de bureau.
- **Transcription et résumé des appels** : les appels audio/vidéo fonctionnent,
  sans transcription.
- **Enrichissement CRM** (Apollo) : désactivé.
