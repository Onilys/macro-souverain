# Macro souverain — un seul serveur, aucune dépendance cloud

Ce fork (`Onilys/macro-souverain`) adapte Macro pour tourner sur **un serveur
unique hébergé en local**, sans AWS, sans Cloudflare, sans fournisseur d'IA
externe et sans SaaS américain. Ce document est la référence de la migration :
décisions, architecture cible, phases et état d'avancement.

## Décisions

| Sujet | Choix |
| --- | --- |
| Hébergement | Serveur local unique (Docker Compose), reverse proxy Caddy |
| IA | Modèles auto-hébergés sur le même serveur (vLLM, API compatible OpenAI) |
| E-mail | Nouveau fournisseur IMAP/SMTP ; Gmail et Outlook désactivés |
| Code | Fork public `Onilys/macro-souverain`, licence AGPLv3 conservée |

**AGPLv3** : utilisation interne libre. Si des tiers (clients, partenaires)
accèdent à l'instance, ils doivent pouvoir obtenir le code source modifié ; le
fork public y répond.

## Architecture cible

```
                     ┌──────────────── serveur unique ────────────────┐
navigateur ── HTTPS ─┤ Caddy (TLS, routage /auth /dss /sync …, front)  │
                     │  ├─ ~15 services Rust (auth, documents, mail…)   │
                     │  ├─ sync-service (workerd, CRDT Loro)            │
                     │  ├─ FusionAuth (Community, auto-hébergé)         │
                     │  ├─ Postgres+pgvector · Redis · Kafka · OpenSearch│
                     │  ├─ Garage (S3) · ElasticMQ (SQS) · local-kms    │
                     │  ├─ supercronic (tâches planifiées)              │
                     │  ├─ vLLM (LLM) · TEI (embeddings, rerank)        │
                     │  ├─ faster-whisper (dictée, transcription)       │
                     │  ├─ LiveKit server (appels)                      │
                     │  └─ Postfix / relais SMTP · LGTM (observabilité) │
                     └─────────────────────────────────────────────────┘
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
| Cloudflare Workers (sync, édition IA) | workerd sur le serveur | config |
| Doppler | fichier d'environnement | aucun |
| Anthropic / OpenAI / Google / Cerebras / Fireworks | vLLM (`LOCAL_LLM_*`) | **fait** |
| Embeddings OpenAI, rerank Cohere | TEI (bge-m3, bge-reranker) | code + migration |
| Whisper OpenAI, Deepgram via LiveKit Cloud | faster-whisper | code |
| LiveKit Cloud | LiveKit server | config |
| PostHog, Google Analytics, Meta Pixel, Datadog | supprimés ; LGTM pour l'observabilité | code |
| Gmail / Outlook | IMAP/SMTP | code (gros) |
| Stripe, Apollo, Pipedream, Daytona, agents cloud | désactivés | config |

## Matériel

Le dimensionnement est dicté par le LLM local.

- **GPU** : 48 Go de VRAM pour un modèle ~30B en 4 bits avec un contexte long
  (par exemple Qwen3-32B-AWQ ou Mistral Small 3.2), plus un petit modèle rapide.
  Une carte de 24 Go suffit pour un modèle ~14B, avec une qualité d'agent nettement
  moindre.
- **CPU / RAM** : 16 cœurs, 128 Go (OpenSearch, Kafka, Postgres et ~25 conteneurs).
- **Disque** : NVMe de 2 To, plus une sauvegarde externe.

## Phases

| # | Phase | Contenu | État |
| --- | --- | --- | --- |
| 0 | Socle | Nix + Docker sur le serveur ; `just run_local --no-doppler` démarre ; tests des commits du fork | à faire (accès serveur) |
| 1 | Infra souveraine | Garage, ElasticMQ, local-kms, DynamoDB Local ; passerelle AWS unique ; mode « auto-hébergé » distinct de `ENVIRONMENT=local` (pas d'auto-connexion de dev) ; Caddy + domaine ; sauvegardes | à faire |
| 2 | Sortie d'AWS côté code | SMTP pour les notifications ; push désactivé ; URL signées sans CloudFront ; Lambdas → workers ; tâches planifiées | à faire |
| 3 | IA locale | Routeur LLM ✅ ; proxy `/chat/completions`, worker d'édition IA, embeddings + migration de dimension, rerank, Whisper, outils serveur Anthropic optionnels, harness opencode, transcription des appels | en cours |
| 4 | Front et domaine | Domaine propre ; suppression des traceurs ; drapeaux de fonctionnalité statiques ; CORS, cookies, domaine d'expéditeur | à faire |
| 5 | IMAP/SMTP | Adaptateur sur le moteur de messagerie générique (créé pour Outlook) ; coffre d'identifiants chiffrés ; formulaire de connexion | à faire |
| 6 | Exploitation | Supervision (LGTM), mises à jour depuis l'amont, procédure de restauration | à faire |

## Ce qui reste hors périmètre

- **Applications mobiles iOS/Android** : le push passe forcément par Apple et
  Google ; l'instance vise le web et l'application de bureau.
- **Agents de code cloud** (Claude, Codex, Cursor) : produits de fournisseurs,
  désactivés.
- **Enrichissement CRM** (Apollo) : aucun équivalent local, désactivé.

## Configuration de l'IA locale

```env
LOCAL_LLM_BASE_URL=http://vllm:8000/v1
LOCAL_LLM_MODEL=Qwen/Qwen3-32B-AWQ
LOCAL_LLM_FAST_MODEL=Qwen/Qwen3-8B-AWQ
# LOCAL_LLM_API_KEY=…   si vLLM est lancé avec --api-key
```

Tout identifiant de modèle demandé par l'application (`anthropic/…`, `openai/…`,
`google/…`) est alors servi par vLLM : les modèles rapides (haiku, mini, flash…)
par `LOCAL_LLM_FAST_MODEL`, les autres par `LOCAL_LLM_MODEL`. Les clés des
fournisseurs doivent rester définies (n'importe quelle valeur) : aucun appel
n'est émis vers eux.
