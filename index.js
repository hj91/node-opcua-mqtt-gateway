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

// Helper function to check file existence
function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (err) {
        console.error(`Error checking existence of ${filePath}:`, err);
        return false;
    }
}

// Load configuration
let config;
const configPath = path.join(__dirname, "config.toml");

if (!fileExists(configPath)) {
    console.error(`Configuration file not found: ${configPath}`);
    process.exit(1);
}

try {
    config = toml.parse(fs.readFileSync(configPath, "utf-8"));
    console.log("Configuration loaded successfully.");
} catch (err) {
    console.error("Error parsing configuration file:", err);
    process.exit(1);
}

// OPC UA connection setup
const clientCertificateFile = path.join(__dirname, "certs/own/certs/client_selfsigned_cert.pem");
const clientPrivateKeyFile = path.join(__dirname, "certs/own/private/private_key.pem");

// Check for certificate and key files
if (!fileExists(clientCertificateFile)) {
    console.error(`Client certificate not found: ${clientCertificateFile}`);
    process.exit(1);
}

if (!fileExists(clientPrivateKeyFile)) {
    console.error(`Client private key not found: ${clientPrivateKeyFile}`);
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
const mqttOptions = {
    username: config.mqtt.username,
    password: config.mqtt.password
};

let mqttClient;
try {
    mqttClient = mqtt.connect(`mqtt://${config.mqtt.host}:${config.mqtt.port}`, mqttOptions);
    console.log("MQTT client connected.");
} catch (err) {
    console.error("Error connecting to MQTT broker:", err);
    process.exit(1);
}

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
                dataType: opcua.DataType.Double,  // Change this based on your datatype - ToDo make it configurable in config.toml
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
                        try {
                            const parsedMessage = JSON.parse(message.toString());
                            await writeToOpcua(session, metric, parsedMessage.value);
                        } catch (err) {
                            console.error(`Error processing message for topic ${topic}:`, err);
                        }
                    }
                });
            }
        }

        // Handle clean exit
        process.on('SIGINT', async () => {
            console.log("Caught interrupt signal, closing session and disconnecting...");
            try {
                await session.close();
                await client.disconnect();
                mqttClient.end();
                console.log("Session closed and client disconnected.");
            } catch (err) {
                console.error("Error during disconnect:", err);
            }
            process.exit(0);
        });
    } catch (err) {
        console.error("Error occurred while connecting or creating session:", err);
        process.exit(1);
    }
}

connectToServer();

