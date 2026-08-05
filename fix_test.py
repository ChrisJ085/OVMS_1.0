import re

with open('src/tests/apiIntegration.test.ts', 'r') as f:
    content = f.read()

# Make the tests correctly use the new endpoints and properties
content = content.replace("overrideData: { reason: 'Test' }", "overrideData: { reason: 'Test' }")

with open('src/tests/apiIntegration.test.ts', 'w') as f:
    f.write(content)
