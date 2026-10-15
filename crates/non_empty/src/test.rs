use super::*;
use serde::Deserialize;
use std::collections::HashMap;

#[test]
fn test_vec_non_empty() {
    let vec = vec![1, 2, 3];
    let result = NonEmpty::new(vec);
    assert!(result.is_ok());
    let non_empty = result.unwrap();
    assert_eq!(non_empty.len(), 3);
}

#[test]
fn test_vec_empty() {
    let vec: Vec<i32> = vec![];
    let result = NonEmpty::new(vec);
    assert!(result.is_err());
}

#[test]
fn test_hashmap_non_empty() {
    let mut map = HashMap::new();
    map.insert("key", "value");
    let result = NonEmpty::new(map);
    assert!(result.is_ok());
}

#[test]
fn test_hashmap_empty() {
    let map: HashMap<String, String> = HashMap::new();
    let result = NonEmpty::new(map);
    assert!(result.is_err());
}

#[test]
fn test_string_non_empty() {
    let s = String::from("hello");
    let result = NonEmpty::new(s);
    assert!(result.is_ok());
}

#[test]
fn test_string_empty() {
    let s = String::new();
    let result = NonEmpty::new(s);
    assert!(result.is_err());
}

#[derive(Debug, Deserialize)]
struct Wrapper {
    items: NonEmpty<Vec<i32>>,
}

#[test]
fn test_deserialize_non_empty_vec() {
    let json = r#"{"items": [1, 2, 3]}"#;
    let wrapper: Wrapper = serde_json::from_str(json).unwrap();
    assert_eq!(wrapper.items.len(), 3);
}

#[test]
fn test_deserialize_empty_vec_fails() {
    let json = r#"{"items": []}"#;
    let result: Result<Wrapper, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn test_deserialize_empty_string_fails() {
    let json = r#""""#;
    let result: Result<NonEmpty<String>, _> = serde_json::from_str(json);
    assert!(result.is_err());
}

#[test]
fn test_deserialize_non_empty_string() {
    let json = r#""hello""#;
    let result: NonEmpty<String> = serde_json::from_str(json).unwrap();
    assert_eq!(result.inner(), "hello");
}

#[test]
fn test_last_mut_needs_no_option() {
    let mut vec = NonEmpty::one(1);
    *vec.last_mut() = 10;
    vec.push(2);
    *vec.last_mut() = 20;
    assert_eq!(vec.inner(), &vec![10, 20]);
}
