#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=== Posterizarr Container Test Script ==="
echo ""

# Check if container-structure-test is installed
if ! command -v container-structure-test &> /dev/null; then
    echo -e "${RED}Error: container-structure-test is not installed.${NC}"
    echo "Please install it from: https://github.com/GoogleContainerTools/container-structure-test"
    echo "For example, on Linux:"
    echo "  curl -LO https://storage.googleapis.com/container-structure-test/latest/container-structure-test-linux-amd64"
    echo "  chmod +x container-structure-test-linux-amd64"
    echo "  sudo mv container-structure-test-linux-amd64 /usr/local/bin/container-structure-test"
    exit 1
fi

# Set variables
IMAGE_NAME="posterizarr:test"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_FILE="${SCRIPT_DIR}/tests.yaml"

echo "Building container image: ${IMAGE_NAME}"
# Create a temporary build context with the entrypoint.sh file in the right place
BUILD_CONTEXT=$(mktemp -d)
cp ${SCRIPT_DIR}/Dockerfile ${BUILD_CONTEXT}/
cp ${SCRIPT_DIR}/entrypoint.sh ${BUILD_CONTEXT}/
echo "Created temporary build context at ${BUILD_CONTEXT}"

# Build from the temporary context
docker build -t ${IMAGE_NAME} -f ${BUILD_CONTEXT}/Dockerfile ${BUILD_CONTEXT}

echo ""
echo "Running container-structure-test..."

# Run container-structure-test with Docker Desktop on Linux
# Check if DOCKER_HOST is set, otherwise use default Docker Desktop socket
if [ -n "$DOCKER_HOST" ]; then
    echo "Using DOCKER_HOST: $DOCKER_HOST"
    container-structure-test test --image ${IMAGE_NAME} --config ${TEST_FILE}
elif [ -S "/var/run/docker.sock" ]; then
    echo "Using default Docker socket"
    container-structure-test test --image ${IMAGE_NAME} --config ${TEST_FILE}
elif [ -S "$HOME/.docker/desktop/docker.sock" ]; then
    echo "Using Docker Desktop socket"
    DOCKER_HOST="unix://$HOME/.docker/desktop/docker.sock" container-structure-test test --image ${IMAGE_NAME} --config ${TEST_FILE}
else
    echo "Trying Docker Desktop socket location"
    DOCKER_HOST="unix://$HOME/.docker/desktop/docker.sock" container-structure-test test --image ${IMAGE_NAME} --config ${TEST_FILE}
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}Container structure tests failed${NC}"
    exit 1
fi
echo -e "${GREEN}Container structure tests passed${NC}"

echo ""
echo "=== Test Summary ==="
echo -e "${GREEN}✓${NC} Container built successfully"
echo -e "${GREEN}✓${NC} All container structure tests passed"
echo ""
echo "You can now run the container with:"
echo "  docker run -d --name posterizarr ${IMAGE_NAME}"
echo ""
echo "Or with parameters:"
echo "  docker run -d --name posterizarr ${IMAGE_NAME} [parameters]"