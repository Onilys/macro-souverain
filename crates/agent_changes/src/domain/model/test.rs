use super::*;

#[test]
fn captured_branch_requires_the_same_repository() {
    let branch = CapturedBranch {
        repository_url: "https://github.com/macro-inc/macro".to_owned(),
        branch: "cursor/work".to_owned(),
    };
    assert_eq!(
        branch.for_repository("https://github.com/MACRO-INC/macro.git"),
        Some("cursor/work")
    );
    for repository in [
        "https://github.com/macro-inc/replaced",
        "https://gitlab.com/macro-inc/macro",
        "https://user@github.com/macro-inc/macro",
        "",
    ] {
        assert_eq!(branch.for_repository(repository), None);
    }
}
