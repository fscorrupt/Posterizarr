import requests
import json

# Test the runtime-stats endpoint
response = requests.get("http://localhost:8000/api/runtime-stats")
print("Status Code:", response.status_code)
print("\nResponse JSON:")
print(json.dumps(response.json(), indent=2))
