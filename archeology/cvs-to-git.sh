#!/bin/sh
# Converts the XBlast CVS snapshot from SourceForge into a git repository.
# Needs cvs-fast-export (brew install cvs-fast-export). Result: original/history
set -e
# original/ is not versioned: create it on a fresh checkout
mkdir -p "$(dirname "$0")/../original/downloads"
cd "$(dirname "$0")/../original"
[ -f downloads/xblast-cvs.zip ] ||
  curl -fL -A Wget -o downloads/xblast-cvs.zip https://sourceforge.net/code-snapshots/cvs/x/xb/xblast.zip
rm -rf cvs history && mkdir cvs
# One deleted level has a Latin-1 file name that bsdtar refuses: skipped (2 lines of warnings).
tar -xf downloads/xblast-cvs.zip -C cvs || true
(cd cvs/xblast && find . -name '*,v' -not -path './CVSROOT/*' | sed 's#^\./##' | cvs-fast-export) > history.fi
git init -q history && git -C history fast-import --quiet < history.fi && git -C history checkout -q master
rm history.fi
git -C history log --oneline | wc -l
