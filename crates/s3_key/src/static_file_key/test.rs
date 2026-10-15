use super::*;

#[test]
fn test_from_s3_key_original() {
    let key = StaticFileKey::from_s3_key("file/abc-123").unwrap();
    assert_eq!(key.file_id(), "abc-123");
    assert_eq!(key.to_key(), "file/abc-123");
    assert!(matches!(key, StaticFileKey::Original { .. }));
}

#[test]
fn test_from_s3_key_variant() {
    let key = StaticFileKey::from_s3_key("file/abc-123/format=avif,size=1080").unwrap();
    assert_eq!(key.file_id(), "abc-123");
    assert_eq!(key.to_key(), "file/abc-123/format=avif,size=1080");
    assert!(matches!(
        key,
        StaticFileKey::Variant {
            ref transform_key,
            ..
        } if transform_key == "format=avif,size=1080"
    ));
}

#[test]
fn test_variant_prefix() {
    let key = StaticFileKey::new("abc-123");
    assert_eq!(key.variant_prefix(), "file/abc-123/");
}

#[test]
fn test_invalid_prefix() {
    assert!(StaticFileKey::from_s3_key("other/abc-123").is_err());
}

#[test]
fn test_empty_file_id() {
    assert!(StaticFileKey::from_s3_key("file/").is_err());
}

#[test]
fn test_empty_transform_key() {
    assert!(StaticFileKey::from_s3_key("file/abc-123/").is_err());
}
