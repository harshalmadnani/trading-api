#!/bin/bash

# Create a temporary directory for building
mkdir -p build
cd build

# Copy the source code
cp -r ../code .

# Install dependencies
npm install --production

# Create the deployment package
zip -r ../deployment.zip .

# Clean up
cd ..
rm -rf build

echo "Deployment package created: deployment.zip" 