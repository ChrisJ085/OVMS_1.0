#!/bin/bash

# Find files containing useDevelopmentContext
FILES=$(grep -rl --exclude-dir=node_modules --exclude-dir=dist "useDevelopmentContext" ./src)

for file in $FILES; do
  # Skip DevelopmentContext itself for now
  if [[ "$file" == "./src/contexts/DevelopmentContext.tsx" || "$file" == "./src/app/routes.tsx" ]]; then
    continue
  fi
  
  echo "Processing $file"
  
  # Remove useDevelopmentContext import
  sed -i '' -e '/import { useDevelopmentContext } from/d' "$file"
  
  # Add imports for useAuth, useSiteContext, useSession if needed
  # Check if useAuth variables are used
  NEEDS_AUTH=$(grep -E 'userProfile|currentUser|user|logout|login|authError|requiresPasswordChange|changePassword' "$file")
  if [[ -n "$NEEDS_AUTH" ]]; then
    # we need to be careful with double imports if they already exist, but assuming they don't
    sed -i '' -e '1i\
import { useAuth } from "'$(echo $file | sed 's|[^/]*/|../|g' | sed 's|..$||')'features/auth/context/AuthContext";
' "$file"
  fi
  
  # ... this might be too complex for a sed script because of relative paths.
done
