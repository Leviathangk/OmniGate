use reqwest::Client;

#[tokio::main]
async fn main() {
    let client = Client::new();
    let res = client.post("http://127.0.0.1:3456/codex/responses")
        .header("Content-Type", "application/json")
        .body(r#"{"prompt": "Hello", "max_tokens": 100}"#)
        .send()
        .await;
    match res {
        Ok(r) => {
            println!("Status: {}", r.status());
            println!("Headers: {:#?}", r.headers());
            println!("Body: {:?}", r.text().await);
        }
        Err(e) => println!("Error: {}", e),
    }
}
