#!/bin/bash

# Parse arguments
RUN_CLIENT=true
RUN_SERVER=true
TEST_ARGS=()

for arg in "$@"; do
  case $arg in
    --client)
      RUN_SERVER=false
      ;;
    --server)
      RUN_CLIENT=false
      ;;
    --both)
      RUN_CLIENT=true
      RUN_SERVER=true
      ;;
    *)
      TEST_ARGS+=("$arg")
      ;;
  esac
done

echo "🧪 Test Runner - Running in $([ "$RUN_CLIENT" = true ] && [ "$RUN_SERVER" = true ] && echo "both" || [ "$RUN_CLIENT" = true ] && echo "client" || echo "server") environment(s)"

# Variables to store timing info
SERVER_DURATION=""
CLIENT_DURATION=""

# Run client tests first
if [ "$RUN_CLIENT" = true ]; then
  echo -e "\n🌐 Running tests in CLIENT environment..."
  CLIENT_OUTPUT=$(npx vitest run "${TEST_ARGS[@]}" 2>&1)
  CLIENT_EXIT_CODE=$?
  
  # Extract duration from output
  CLIENT_DURATION=$(echo "$CLIENT_OUTPUT" | grep "Duration" | tail -1)
  
  if [ $CLIENT_EXIT_CODE -ne 0 ]; then
    echo "$CLIENT_OUTPUT"
    echo "❌ Client tests failed"
    exit $CLIENT_EXIT_CODE
  fi
  echo "$CLIENT_OUTPUT"
  echo "✅ Client tests passed"
fi

# Run server tests second
if [ "$RUN_SERVER" = true ]; then
  echo -e "\n🔧 Running tests in SERVER environment..."
  SERVER_OUTPUT=$(NODE_OPTIONS='--conditions react-server' npx vitest run "${TEST_ARGS[@]}" 2>&1)
  SERVER_EXIT_CODE=$?
  
  # Extract duration from output
  SERVER_DURATION=$(echo "$SERVER_OUTPUT" | grep "Duration" | tail -1)
  
  if [ $SERVER_EXIT_CODE -ne 0 ]; then
    echo "$SERVER_OUTPUT"
    echo "❌ Server tests failed"
    exit $SERVER_EXIT_CODE
  fi
  echo "$SERVER_OUTPUT"
  echo "✅ Server tests passed"
fi

echo -e "\n🎉 All tests completed successfully!"

# Display timing details
echo -e "\n🕒 Timing details:"
if [ "$RUN_SERVER" = true ] && [ -n "$SERVER_DURATION" ]; then
  echo "🔧 Server: $SERVER_DURATION"
fi
if [ "$RUN_CLIENT" = true ] && [ -n "$CLIENT_DURATION" ]; then
  echo "🌐 Client: $CLIENT_DURATION"
fi

# Note about timing interpretation
if [ "$RUN_SERVER" = true ] && [ "$RUN_CLIENT" = true ]; then
  echo -e "\n📊 Note: Timing comparisons may be affected by cold start effects and execution order."
fi
