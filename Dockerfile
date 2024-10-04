# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the application code (excluding config and certs)
COPY . .

# Create directories for certs and config
RUN mkdir -p /app/certs /app/config

# Set default environment variables (can be overridden)
ENV CONFIG_FILE_PATH=/app/config/config.toml

# Command to run the application
CMD [ "node", "index.js" ]

