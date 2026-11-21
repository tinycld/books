#!/usr/bin/env bash
# Runs one shard of the Books Go tests, from server/: every Nth top-level test
# of the package in name order. Tests of one feature share a name prefix and
# often a cost, so name order spreads a slow group over every shard. Each
# shard is its own test binary, with its own 10-minute limit.
#
# Usage: go-test-shard.sh <shard> <shards>   (shard counts from 1)
set -euo pipefail

shard=$1
shards=$2

# The shards split the tests of one package. A second package would be in no
# shard, so it stops the run instead.
packages=$(go list ./...)
if [ "$(printf '%s\n' "$packages" | wc -l)" -ne 1 ]; then
    printf 'go-test-shard.sh splits one package; found:\n%s\n' "$packages" >&2
    exit 1
fi

# A command substitution, not a process substitution, so set -e stops the run
# when the list fails part way.
list=$(go test -list '.*' .)
mapfile -t names < <(printf '%s\n' "$list" | grep -E '^(Test|Example|Fuzz)' | LC_ALL=C sort)
if [ "${#names[@]}" -eq 0 ]; then
    echo 'go-test-shard.sh: go test -list found no test' >&2
    exit 1
fi

picked=()
for i in "${!names[@]}"; do
    if [ $((i % shards)) -eq $((shard - 1)) ]; then
        picked+=("${names[$i]}")
    fi
done
# ^()$ matches no test, and go test passes with none run.
if [ "${#picked[@]}" -eq 0 ]; then
    echo "go-test-shard.sh: shard $shard of $shards has no test" >&2
    exit 1
fi
echo "shard $shard/$shards: ${#picked[@]} of ${#names[@]} top-level tests"

pattern="^($(IFS='|'; echo "${picked[*]}"))\$"
go test -count=1 -run "$pattern" .
