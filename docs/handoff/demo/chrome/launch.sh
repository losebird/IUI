#!/bin/bash
export DSH_HOME=/data/dshhome PATH=/data/dshenv/bin:$PATH
if [ ! -d $DSH_HOME/profiles/wchrome ]; then dsh --profile wchrome --from-default-profile web --dump-config >/dev/null 2>&1; dsh plugin --profile wchrome add link:/data/IUI > /tmp/wchrome-add.log 2>&1; fi
cd /data/work/ab
exec dsh --profile wchrome --patch /data/dshenv/kilo.patch.yml --port 3099 --host 127.0.0.1 --no-open > /tmp/dsh-chrome/web.log 2>&1
