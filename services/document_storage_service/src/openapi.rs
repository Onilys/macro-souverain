#![allow(unused)]
#![recursion_limit = "256"]

mod api;
mod config;
mod model;
mod native_messaging;
mod outbound;
mod service;

use utoipa::OpenApi;

fn main() {
    println!(
        "{}",
        api::swagger::ApiDoc::openapi().to_pretty_json().unwrap()
    );
}
