use super::*;
use macro_db_client::instructions::create::create_instructions_document;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path, query_param},
};

#[sqlx::test(
    migrator = "macro_db_migrator::MACRO_DB_MIGRATIONS",
    fixtures(
        path = "../../../../macro_db_client/fixtures",
        scripts("basic_user_with_documents")
    )
)]
async fn only_the_owners_document_is_rendered_and_its_body_is_reloaded(pool: PgPool) {
    let owner = MacroUserIdStr::try_from_email("user@user.com").unwrap();
    let other = MacroUserIdStr::try_from_email("user2@user.com").unwrap();
    let document_id = create_instructions_document(&pool, owner.clone())
        .await
        .unwrap();
    let server = MockServer::start().await;
    let source = PgUserInstructions::new(pool, LexicalClient::new("test".into(), server.uri()));

    for instructions in ["Answer in French.", "Answer in Spanish.", ""] {
        server.reset().await;
        Mock::given(method("GET"))
            .and(path(format!("/markdown/{document_id}")))
            .and(query_param("target", "external"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"data": instructions})),
            )
            .expect(1)
            .mount(&server)
            .await;
        assert_eq!(
            source.load(&owner).await.unwrap(),
            Some(instructions.to_owned())
        );
        assert_eq!(source.load(&other).await.unwrap(), None);
        server.verify().await;
    }
}
