/**

 node-opcua-mqtt-gateway/index.js - Copyright 2024 Harshad Joshi and Bufferstack.IO Analytics Technology LLP, Pune

 Licensed under the GNU General Public License, Version 3.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.gnu.org/licenses/gpl-3.0.html

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/


const opcua = require("node-opcua");
const mqtt = require("mqtt");
const fs = require("fs");
const toml = require("toml");
const path = require("path");

// Load configuration from environment variable or default to mounted config path
const configPath = process.env.CONFIG_FILE_PATH || path.join(__dirname, "config/config.toml");

// Check if config.toml exists
if (!fs.existsSync(configPath)) {
    console.error("Error: config.toml file not found at", configPath);
    process.exit(1);
}

const config = toml.parse(fs.readFileSync(configPath, "utf-8"));

// OPC UA connection setup
const clientCertificateFile = process.env.CERT_FILE_PATH || path.join(__dirname, "certs/own/certs/client_selfsigned_cert.pem");
const clientPrivateKeyFile = process.env.PRIVATE_KEY_FILE_PATH || path.join(__dirname, "certs/own/private/private_key.pem");

// Check if certificates exist
if (!fs.existsSync(clientCertificateFile) || !fs.existsSync(clientPrivateKeyFile)) {
    console.error("Error: Certificates not found. Make sure they are mounted correctly.");
    process.exit(1);
}

const client = opcua.OPCUAClient.create({
    certificateFile: clientCertificateFile,
    privateKeyFile: clientPrivateKeyFile,
    securityMode: opcua.MessageSecurityMode.None,
    securityPolicy: opcua.SecurityPolicy.None,
    endpointMustExist: false
});

// MQTT connection setup
const mqttClient = mqtt.connect(`mqtt://${config.mqtt.host}:${config.mqtt.port}`, {
    username: config.mqtt.username,
    password: config.mqtt.password
});

// Function to log data to MQTT
function logToMqtt(topic, value) {
    const message = JSON.stringify({ value });
    mqttClient.publish(topic, message, { qos: 0, retain: false }, (err) => {
        if (err) {
            console.error(`Failed to publish to topic ${topic}:`, err);
        } else {
            console.log(`Published to topic ${topic}: ${message}`);
        }
    });
}

// Function to write data to OPC UA server
async function writeToOpcua(session, metric, value) {
    try {
        const dataValue = {
            value: {
                dataType: opcua.DataType.Double,  // Change this based on your datatype - ToDo - add this to config/config.toml
                value: value,
            }
        };
        await session.write({
            nodeId: metric.nodeId,
            attributeId: opcua.AttributeIds.Value,
            value: dataValue,
        });
        console.log(`Written value ${value} to ${metric.nodeId}`);
    } catch (error) {
        console.error(`Error writing to ${metric.nodeId}:`, error);
    }
}

async function connectToServer() {
    try {
        console.log("Connecting to the OPC UA server...");
        await client.connect(config.opcua.url);
        console.log("Connected to OPC UA server!");

        const session = await client.createSession();
        console.log("Session created!");

        for (const metric of config.metrics) {
            // If mode is 'pub', set up publishing
            if (metric.mode === "pub" || metric.mode === "pubsub") {
                setInterval(async () => {
                    try {
                        const dataValue = await session.readVariableValue(metric.nodeId);
                        const value = dataValue.value.value;  // Assuming datatype is number
                        console.log(`Read value from ${metric.nodeId}: ${value}`);
                        logToMqtt(metric.topic, value);
                    } catch (error) {
                        console.error(`Error reading from ${metric.nodeId}:`, error);
                    }
                }, metric.interval);
            }

            // If mode is 'sub' or 'pubsub', set up subscribing
            if (metric.mode === "sub" || metric.mode === "pubsub") {
                mqttClient.subscribe(metric.topic, (err) => {
                    if (err) {
                        console.error(`Failed to subscribe to topic ${metric.topic}:`, err);
                    } else {
                        console.log(`Subscribed to topic ${metric.topic}`);
                    }
                });

                mqttClient.on('message', async (topic, message) => {
                    if (topic === metric.topic) {
                        const parsedMessage = JSON.parse(message.toString());
                        await writeToOpcua(session, metric, parsedMessage.value);
                    }
                });
            }
        }

        // Handle clean exit
        process.on('SIGINT', async () => {
            await session.close();
            await client.disconnect();
            mqttClient.end();
            console.log("Session closed and client disconnected.");
            process.exit(0);
        });
    } catch (err) {
        console.error("An error occurred:", err);
        process.exit(1);
    }
}

connectToServer();

