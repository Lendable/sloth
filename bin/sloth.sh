#!/usr/bin/env bash

set -e

TOKEN=$1
REF=$2
REPOSITORY=$3
# Interval in seconds between check of checks
INTERVAL=${4:-10}
# How long to spin for in seconds before marking job as failed, initial delay not considered
TIMEOUT=${5:-300}
# Self name
NAME=${6:-"sloth"}
# Conclusions of which checks to ignore
IFS=,
IGNORE=(${7:-$NAME})
# Ensure self is ignored
if [[ ! " ${IGNORE[@]} " =~ " $NAME " ]]; then
  IGNORE+=($NAME)
fi
unset IFS

echo "Ignoring: ${IGNORE[@]}"

FOUND_JOBS=0
START=`date +%s`

while :; do
  PAGE=1
  RUNS='[]'

  while :; do
    CURRENT_PAGE=`curl -L \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer $TOKEN" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        --silent \
        https://api.github.com/repos/$REPOSITORY/commits/$REF/check-runs?page=$PAGE\&per_page=100`

    TOTAL=`echo "$CURRENT_PAGE" | jq -r '.total_count'`
    CURRENT_RUNS=`echo "$CURRENT_PAGE" | jq -r '.check_runs | map({"name": .name, "conclusion": .conclusion})'`
    RUNS=`echo -e $RUNS'\n'$CURRENT_RUNS | jq -s 'add'`

    if [[ "$TOTAL" -le "`echo "$RUNS" | jq -r 'length'`" ]]; then
      break
    fi

    PAGE=$((PAGE + 1))
  done

  PENDING=0
  HAS_FAILURE=0

  echo "Checks:"

  IFS=$'\n'
  for job in $(echo "${RUNS}" | jq -r '.[].name'); do
    echo -n $job

    if [[ " ${IGNORE[@]} " =~ " $job " ]]; then
      echo -n ' (ignored)'
    else
      FOUND_JOBS=1
      CONCLUSION=`echo "$RUNS" | jq -rj '.[] | select(.name == "'$job'") | .conclusion // "pending"'`
      echo -n " ($CONCLUSION)"

      if [[ "$CONCLUSION" == "pending" ]]; then
        PENDING=$((PENDING + 1))
      fi

      if [[ "$CONCLUSION" == "failure" ]] || [[ "$CONCLUSION" == "cancelled" ]]; then
        HAS_FAILURE=1
      fi
    fi

    echo
  done

  if [[ $HAS_FAILURE -eq 1 ]]; then
    exit 1
  fi

  if [[ $FOUND_JOBS -eq 0 ]]; then
    sleep $INTERVAL

    continue
  fi

  if [[ $PENDING -eq 0 ]]; then
    exit 0
  fi

  if [[ "$START + $TIMEOUT" -le `date +%s` ]]; then
    echo "TIMEOUT :("
    exit 1
  fi

  sleep $INTERVAL
done
