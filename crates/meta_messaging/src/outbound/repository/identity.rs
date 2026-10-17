//! Resolve provider-authenticated associations without changing native authors or channels.
//! Account row locks serialize identity changes with ingestion and the send fence.
use super::*;
use crate::domain::events::{IdentityUpdate, IncomingMessage};
use sqlx::{Postgres, Transaction};

struct Identity {
    id: Uuid,
    current_id: String,
    phone: Option<String>,
    phone_observed_at: Option<DateTime<Utc>>,
    changed_at: Option<DateTime<Utc>>,
    retired_at: Option<DateTime<Utc>>,
}

async fn find(
    tx: &mut Transaction<'_, Postgres>,
    connection: Uuid,
    identifier: &str,
) -> PortResult<Option<Identity>> {
    sqlx::query_as!(
        Identity,
        r#"SELECT i.id,i.current_id,i.phone,i.phone_observed_at,i.changed_at,a.retired_at
        FROM meta_messaging_identifier a JOIN meta_messaging_identity i
          ON i.connection_id=a.connection_id AND i.id=a.identity_id
        WHERE a.connection_id=$1 AND a.identifier=$2"#,
        connection,
        identifier
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(failure)
}

async fn alias(
    tx: &mut Transaction<'_, Postgres>,
    connection: Uuid,
    identity: Uuid,
    identifier: &str,
) -> PortResult<()> {
    let changed=sqlx::query!(r#"INSERT INTO meta_messaging_identifier(connection_id,identifier,identity_id)
        VALUES ($1,$2,$3) ON CONFLICT (connection_id,identifier) DO UPDATE SET identifier=EXCLUDED.identifier
        WHERE meta_messaging_identifier.identity_id=EXCLUDED.identity_id"#,connection,identifier,identity)
        .execute(&mut **tx).await.map_err(failure)?;
    if changed.rows_affected() != 1 {
        return Err(MessagingError::Conflict.into());
    }
    Ok(())
}

async fn create(
    tx: &mut Transaction<'_, Postgres>,
    connection: Uuid,
    identifier: &ProviderId,
) -> PortResult<Identity> {
    let identity = Identity {
        id: Uuid::now_v7(),
        current_id: identifier.as_str().into(),
        phone: None,
        phone_observed_at: None,
        changed_at: None,
        retired_at: None,
    };
    sqlx::query!(
        "INSERT INTO meta_messaging_identity(connection_id,id,current_id) VALUES ($1,$2,$3)",
        connection,
        identity.id,
        identity.current_id
    )
    .execute(&mut **tx)
    .await
    .map_err(failure)?;
    alias(tx, connection, identity.id, identifier.as_str()).await?;
    Ok(identity)
}

// Two already-materialized customer histories are never silently merged.
async fn rekey(
    tx: &mut Transaction<'_, Postgres>,
    connection: Uuid,
    old: &str,
    current: &str,
) -> PortResult<()> {
    if old == current {
        return Ok(());
    }
    let incompatible=sqlx::query_scalar!("SELECT EXISTS(SELECT 1 FROM meta_messaging_revision a JOIN meta_messaging_revision b ON b.connection_id=a.connection_id AND b.provider_message_id=a.provider_message_id WHERE a.connection_id=$1 AND a.customer_id=$2 AND b.customer_id=$3 AND a.direction<>b.direction)",connection,old,current)
        .fetch_one(&mut **tx).await.map_err(failure)?.unwrap_or(false);
    if incompatible {
        return Err(MessagingError::Conflict.into());
    }
    let count=sqlx::query_scalar!("SELECT count(*) FROM meta_messaging_conversation WHERE connection_id=$1 AND customer_id=ANY($2)",connection,&[old.to_owned(),current.to_owned()])
        .fetch_one(&mut **tx).await.map_err(failure)?.unwrap_or_default();
    if count > 1 {
        return Err(MessagingError::Conflict.into());
    }
    sqlx::query!("UPDATE meta_messaging_conversation SET customer_id=$3 WHERE connection_id=$1 AND customer_id=$2",connection,old,current)
        .execute(&mut **tx).await.map_err(failure)?;
    // Revisions can precede their messages and have no conversation foreign key.
    sqlx::query!(r#"INSERT INTO meta_messaging_revision(connection_id,customer_id,provider_message_id,direction,edit_number,content,edited_at,deleted_at)
        SELECT connection_id,$3,provider_message_id,direction,edit_number,content,edited_at,deleted_at
        FROM meta_messaging_revision WHERE connection_id=$1 AND customer_id=$2
        ON CONFLICT (connection_id,customer_id,provider_message_id) DO UPDATE SET
          content=CASE WHEN EXCLUDED.edit_number>meta_messaging_revision.edit_number THEN EXCLUDED.content ELSE meta_messaging_revision.content END,
          edited_at=CASE WHEN EXCLUDED.edit_number>meta_messaging_revision.edit_number THEN EXCLUDED.edited_at ELSE meta_messaging_revision.edited_at END,
          edit_number=GREATEST(EXCLUDED.edit_number,meta_messaging_revision.edit_number),
          deleted_at=COALESCE(meta_messaging_revision.deleted_at,EXCLUDED.deleted_at)
        WHERE meta_messaging_revision.direction=EXCLUDED.direction"#,connection,old,current).execute(&mut **tx).await.map_err(failure)?;
    sqlx::query!(
        "DELETE FROM meta_messaging_revision WHERE connection_id=$1 AND customer_id=$2",
        connection,
        old
    )
    .execute(&mut **tx)
    .await
    .map_err(failure)?;
    Ok(())
}

async fn merge(
    tx: &mut Transaction<'_, Postgres>,
    connection: Uuid,
    old: &Identity,
    current: &Identity,
) -> PortResult<()> {
    if old.id == current.id {
        return Ok(());
    }
    rekey(tx, connection, &old.current_id, &current.current_id).await?;
    sqlx::query!("UPDATE meta_messaging_identifier SET identity_id=$3 WHERE connection_id=$1 AND identity_id=$2",connection,old.id,current.id)
        .execute(&mut **tx).await.map_err(failure)?;
    sqlx::query!(
        "DELETE FROM meta_messaging_identity WHERE connection_id=$1 AND id=$2",
        connection,
        old.id
    )
    .execute(&mut **tx)
    .await
    .map_err(failure)?;
    Ok(())
}

async fn route(
    tx: &mut Transaction<'_, Postgres>,
    connection: Uuid,
    identity: &Identity,
    phone: Option<&str>,
    at: DateTime<Utc>,
) -> PortResult<()> {
    if let Some(phone) = phone {
        alias(tx, connection, identity.id, phone).await?;
        sqlx::query!("UPDATE meta_messaging_identifier SET retired_at=NULL WHERE connection_id=$1 AND identifier=$2 AND identity_id=$3",connection,phone,identity.id)
            .execute(&mut **tx).await.map_err(failure)?;
    }
    if identity.phone.as_deref() != phone
        && let Some(old) = identity.phone.as_deref()
    {
        sqlx::query!("UPDATE meta_messaging_identifier SET retired_at=COALESCE(retired_at,$3) WHERE connection_id=$1 AND identifier=$2",connection,old,at)
            .execute(&mut **tx).await.map_err(failure)?;
    }
    sqlx::query!("UPDATE meta_messaging_identity SET phone=$3,phone_observed_at=$4 WHERE connection_id=$1 AND id=$2",connection,identity.id,phone,at)
        .execute(&mut **tx).await.map_err(failure)?;
    sqlx::query!("UPDATE meta_messaging_conversation SET customer_phone=$3 WHERE connection_id=$1 AND customer_id=$2",connection,identity.current_id,phone)
        .execute(&mut **tx).await.map_err(failure)?;
    Ok(())
}

impl PgMessagingRepository {
    /// Normalize a message inside the same transaction as native materialization.
    pub async fn resolve_message_in(
        tx: &mut Transaction<'_, Postgres>,
        c: &Connection,
        message: &IncomingMessage,
    ) -> PortResult<IncomingMessage> {
        if c.provider != Provider::Whatsapp {
            return Ok(message.clone());
        }
        let (customer_id, phone) = Self::observe_identity_in(
            tx,
            c,
            &message.customer_id,
            message.customer_phone.as_ref(),
            message.timestamp,
        )
        .await?;
        let mut message = message.clone();
        message.customer_id = customer_id;
        message.customer_phone = phone;
        Ok(message)
    }

    /// Retain a verified identity/phone association without creating a channel.
    pub async fn observe_identity_in(
        tx: &mut Transaction<'_, Postgres>,
        c: &Connection,
        raw: &ProviderId,
        phone: Option<&ProviderId>,
        at: DateTime<Utc>,
    ) -> PortResult<(ProviderId, Option<ProviderId>)> {
        Self::lock_identity_in(tx, c).await?;
        let phone = phone.map(ProviderId::as_str);
        let known = find(tx, c.id, raw.as_str()).await?;
        let by_phone = match phone {
            Some(phone) => find(tx, c.id, phone).await?,
            None => None,
        };
        if known
            .as_ref()
            .is_some_and(|i| i.retired_at.is_some_and(|retired_at| at > retired_at))
            && !raw.is_whatsapp_bsuid()
        {
            return Err(MessagingError::Conflict.into());
        }
        let mut identity = match (known, by_phone) {
            (Some(known), Some(phone)) if known.id != phone.id => {
                // A current BSUID association is not proof that a recycled phone's
                // previous BSUID belonged to the same person.
                if ProviderId::try_from(phone.current_id.clone())?.is_whatsapp_bsuid()
                    || phone.retired_at.is_some()
                {
                    return Err(MessagingError::Conflict.into());
                }
                merge(tx, c.id, &phone, &known).await?;
                known
            }
            (Some(known), _) => known,
            (None, Some(mut phone)) => {
                if ProviderId::try_from(phone.current_id.clone())?.is_whatsapp_bsuid()
                    || phone.retired_at.is_some()
                {
                    return Err(MessagingError::Conflict.into());
                }
                rekey(tx, c.id, &phone.current_id, raw.as_str()).await?;
                sqlx::query!("UPDATE meta_messaging_identity SET current_id=$3 WHERE connection_id=$1 AND id=$2",c.id,phone.id,raw.as_str())
                    .execute(&mut **tx).await.map_err(failure)?;
                alias(tx, c.id, phone.id, raw.as_str()).await?;
                phone.current_id = raw.as_str().into();
                phone
            }
            (None, None) => create(tx, c.id, raw).await?,
        };
        // Old aliases resolve late facts but can never restore obsolete routing.
        if raw.as_str() == identity.current_id
            && phone.is_some()
            && identity
                .changed_at
                .is_none_or(|changed_at| at >= changed_at)
            && identity
                .phone_observed_at
                .is_none_or(|observed_at| at >= observed_at)
        {
            route(tx, c.id, &identity, phone, at).await?;
            identity.phone = phone.map(str::to_owned);
        }
        Ok((
            identity.current_id.try_into()?,
            identity.phone.map(ProviderId::try_from).transpose()?,
        ))
    }

    /// Retain an authoritative system identity change, including before the first message.
    pub async fn update_identity_in(
        tx: &mut Transaction<'_, Postgres>,
        c: &Connection,
        update: &IdentityUpdate,
    ) -> PortResult<()> {
        Self::lock_identity_in(tx, c).await?;
        // Both pairs are provider facts. Resolve legacy phone-only records before
        // applying the edge; never infer this relationship from display names.
        Self::observe_identity_in(
            tx,
            c,
            &update.previous,
            update.previous_phone.as_ref(),
            update.timestamp,
        )
        .await?;
        let previous = find(tx, c.id, update.previous.as_str()).await?;
        if let Some(phone) = update.phone.as_ref()
            && let Some(known) = find(tx, c.id, phone.as_str()).await?
            && previous
                .as_ref()
                .is_none_or(|previous| previous.id != known.id)
        {
            Self::observe_identity_in(tx, c, &update.current, Some(phone), update.timestamp)
                .await?;
        }
        let current = find(tx, c.id, update.current.as_str()).await?;
        let successor_boundary = current.as_ref().and_then(|identity| identity.retired_at);
        let mut identity = match (previous, current) {
            (Some(previous), Some(current)) if previous.id != current.id => {
                if previous.phone.as_ref()
                    != update
                        .phone
                        .as_ref()
                        .map(|p| p.as_str())
                        .map(str::to_owned)
                        .as_ref()
                    && let Some(phone) = previous.phone.as_deref()
                {
                    sqlx::query!("UPDATE meta_messaging_identifier SET retired_at=COALESCE(retired_at,$3) WHERE connection_id=$1 AND identifier=$2",c.id,phone,update.timestamp)
                        .execute(&mut **tx).await.map_err(failure)?;
                }
                merge(tx, c.id, &previous, &current).await?;
                sqlx::query!("UPDATE meta_messaging_conversation SET customer_phone=$3 WHERE connection_id=$1 AND customer_id=$2",c.id,current.current_id,current.phone)
                    .execute(&mut **tx).await.map_err(failure)?;
                current
            }
            (Some(previous), Some(_)) => previous,
            (Some(mut previous), None) => {
                // A different successor is conflicting evidence, not a second rename.
                if previous.current_id != update.previous.as_str() {
                    return Err(MessagingError::Conflict.into());
                }
                rekey(tx, c.id, &previous.current_id, update.current.as_str()).await?;
                sqlx::query!("UPDATE meta_messaging_identity SET current_id=$3 WHERE connection_id=$1 AND id=$2",c.id,previous.id,update.current.as_str())
                    .execute(&mut **tx).await.map_err(failure)?;
                previous.current_id = update.current.as_str().into();
                previous.phone_observed_at = None;
                previous
            }
            (None, Some(current)) => current,
            (None, None) => create(tx, c.id, &update.current).await?,
        };
        alias(tx, c.id, identity.id, update.previous.as_str()).await?;
        alias(tx, c.id, identity.id, update.current.as_str()).await?;
        if update.previous != update.current {
            sqlx::query!("UPDATE meta_messaging_identifier SET retired_at=LEAST(retired_at,$3) WHERE connection_id=$1 AND identifier=$2",c.id,update.previous.as_str(),update.timestamp)
                .execute(&mut **tx).await.map_err(failure)?;
        }

        if let Some(phone) = update
            .previous_phone
            .as_ref()
            .filter(|phone| update.phone.as_ref() != Some(*phone))
        {
            alias(tx, c.id, identity.id, phone.as_str()).await?;
            sqlx::query!("UPDATE meta_messaging_identifier SET retired_at=LEAST(retired_at,$3) WHERE connection_id=$1 AND identifier=$2",c.id,phone.as_str(),update.timestamp)
                .execute(&mut **tx).await.map_err(failure)?;
        }
        if identity.current_id != update.current.as_str()
            && let Some(phone) = update.phone.as_ref()
            && identity.phone.as_deref() != Some(phone.as_str())
        {
            alias(tx, c.id, identity.id, phone.as_str()).await?;
            let retired_at = successor_boundary
                .or(identity.changed_at)
                .unwrap_or(update.timestamp);
            sqlx::query!("UPDATE meta_messaging_identifier SET retired_at=LEAST(retired_at,$3) WHERE connection_id=$1 AND identifier=$2",c.id,phone.as_str(),retired_at)
                .execute(&mut **tx).await.map_err(failure)?;
        }
        // B -> C can arrive before A -> B. The later edge remains the destination.
        if identity.current_id == update.current.as_str()
            && identity.changed_at.is_none_or(|at| update.timestamp > at)
        {
            if identity
                .phone_observed_at
                .is_none_or(|at| at <= update.timestamp)
            {
                route(
                    tx,
                    c.id,
                    &identity,
                    update.phone.as_ref().map(ProviderId::as_str),
                    update.timestamp,
                )
                .await?;
            }
            identity.changed_at = Some(update.timestamp);
            sqlx::query!(
                "UPDATE meta_messaging_identity SET changed_at=$3 WHERE connection_id=$1 AND id=$2",
                c.id,
                identity.id,
                identity.changed_at
            )
            .execute(&mut **tx)
            .await
            .map_err(failure)?;
        }
        Ok(())
    }

    /// Resolve a previous identifier for a source revision without new routing data.
    pub async fn resolve_identifier_in(
        tx: &mut Transaction<'_, Postgres>,
        c: &Connection,
        identifier: &ProviderId,
    ) -> PortResult<ProviderId> {
        if c.provider != Provider::Whatsapp {
            return Ok(identifier.clone());
        }
        Self::lock_identity_in(tx, c).await?;
        Ok(match find(tx, c.id, identifier.as_str()).await? {
            Some(identity) => identity.current_id.try_into()?,
            None => create(tx, c.id, identifier).await?.current_id.try_into()?,
        })
    }

    async fn lock_identity_in(
        tx: &mut Transaction<'_, Postgres>,
        c: &Connection,
    ) -> PortResult<()> {
        let row=sqlx::query!("SELECT connected_at,status FROM meta_messaging_connection WHERE id=$1 AND team_id=$2 FOR UPDATE",c.id,c.team_id)
            .fetch_optional(&mut **tx).await.map_err(failure)?.ok_or(MessagingError::NotFound)?;
        if row.connected_at != c.connected_at {
            return Err(MessagingError::Conflict.into());
        }
        if matches!(row.status.as_str(), "disconnected" | "revoked") {
            return Err(MessagingError::Disconnected.into());
        }
        Ok(())
    }
}
