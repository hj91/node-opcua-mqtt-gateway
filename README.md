# Node OPC UA MQTT Gateway

## Description

The **Node OPC UA MQTT Gateway** is a Node.js application that facilitates communication between an OPC UA server and an MQTT broker. This application allows you to read and write data from an OPC UA server using MQTT, enabling seamless integration of industrial automation data into IoT applications.

## Features

- Connects to an OPC UA server and retrieves data.
- Publishes data to an MQTT broker.
- Supports both reading from and writing to the OPC UA server via MQTT.
- Configurable via a `config.toml` file for easy setup.

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hj91/node-opcua-mqtt-gateway.git
   cd node-opcua-mqtt-gateway
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Generate SSL certificates (if necessary):**
   ```bash
     1.  mkdir -p ./certs/own/certs ./certs/own/private
     2. openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ./certs/own/private/private_key.pem -out ./certs/own/certs/client_selfsigned_cert.pem -subj "/CN=NodeOPCUAClient" -extensions san -config <(cat /etc/ssl/openssl.cnf \
    <(printf "[san]\nsubjectAltName=URI:urn:iiot-gateway:NodeOPCUA-Client"))
   ```

4. **Configure the application:**
   Edit the `config.toml` file to set up the OPC UA and MQTT connection settings.

## Configuration

### `config.toml`

Here’s a sample configuration file:

```toml
# OPC UA connection settings
[opcua]
url = "opc.tcp://192.168.1.43:49320/KEPServerEX"
user = ""
pass = ""

# MQTT connection settings
[mqtt]
host = "localhost"
port = 1883
username = ""
password = ""

# Metrics to collect
[[metrics]]
datatype = "number"
tags = { machine = "machine_1", fields = "valid_job" }
nodeId = "ns=2;s=Painting.MachineID.Valid_job"
interval = 1000
topic = "painting/machineID/valid_job"

[[metrics]]
datatype = "number"
tags = { machine = "machine_2", fields = "invalid_job" }
nodeId = "ns=2;s=Painting.MachineID.Invalid_job"
interval = 1000
topic = "painting/machineID/invalid_job"
```

## Usage

To start the application, run:

```bash
npm start
```

The application will connect to the OPC UA server, retrieve specified metrics, and publish them to the configured MQTT topics.

## License

This project is licensed under the **GPL-3.0 License**. See the [LICENSE](LICENSE) file for details.

## Author

**Harshad Joshi**  
GitHub: [hj91](https://github.com/hj91)
