# http-proxy

A node JS CLI to proxy requests to another URL.

## Usage
`http-server [options]`

## Options

| Option | Alias | Description | Default |
|-|-|-|-|
| --port | -p | The port to run the proxy server on | 8080 |
| --target | -t | The URL to proxy requests to | *required* |
| --ip || Show the IP address of requests in the console | false |
| --secure | -S | Run the server in HTTPS mode | false |
| --key | -K | The path to the private key when using HTTPS mode | key.pem |
| --cert | -C | The path to the public key when using HTTPS mode | cert.pem |