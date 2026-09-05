#!/bin/sh
# Demo sequence: drives the M-Vave Chocolate Plus editor through the
# window stack (launchpad -> FootCtrlPlus), switching pedals and toggling
# the events list. 1s between each CLI invocation.
#
# TIP: if any step exits 1 (window-stack gate refused it), run
#   python3 choco.py state
# to see which actions are currently allowed.
set -e

step() { echo; echo "== $*"; python3 choco.py "$@"; }

# 1. launchpad -> FootCtrlPlus (runs the init sequence)
step start-foot-ctrl-plus
sleep 1

# 2. cycle through all four foot switches
for p in A B C D; do
  step switch "$p"
  sleep 1
done

# 3. Add, Remove all, then Add twice, Remove all, ...
step add
sleep 1
step remove-all
sleep 1
step add
sleep 1
step add
sleep 1
step remove-all

echo
echo "sequence done; current state:"
python3 choco.py state