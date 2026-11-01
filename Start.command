#!/bin/zsh
cd "$(dirname "$0")"
if curl -fsS 'http://127.0.0.1:8890/api.php?action=session' >/dev/null 2>&1; then
  open http://127.0.0.1:8890
  exit
fi
if ! command -v php >/dev/null 2>&1; then
  print 'PHP is required to run APG. Install PHP 8.2 or newer, then reopen this file.'
  read 'answer?Press Enter to close.'
  exit 1
fi
(sleep 2; open http://127.0.0.1:8890) &
php -S 127.0.0.1:8890 -t public
