#!/usr/bin/env python3
"""Add a blog skill with a fixed listing date (Asia/Shanghai)."""
import argparse
import datetime
import json
from pathlib import Path
from zoneinfo import ZoneInfo


def iso_date(value):
    try:
        parsed = datetime.date.fromisoformat(value)
        if parsed.isoformat() != value:
            raise ValueError
        return value
    except ValueError:
        raise argparse.ArgumentTypeError('Date must be YYYY-MM-DD')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', required=True)
    parser.add_argument('--url', required=True)
    parser.add_argument('--description', required=True)
    parser.add_argument('--date', type=iso_date, help='Override listing date for historical entries')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    date = args.date or datetime.datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat()
    fields = [('name', args.name), ('date', date), ('description', args.description), ('url', args.url)]
    entry = '\n'.join(('- ' if i == 0 else '  ') + key + ': ' + json.dumps(value, ensure_ascii=False)
                      for i, (key, value) in enumerate(fields)) + '\n'
    if args.dry_run:
        print(entry, end='')
        return
    path = Path(__file__).resolve().parents[1] / 'data/skills.yaml'
    existing = path.read_text()
    separator = '' if not existing or existing.endswith('\n') else '\n'
    with path.open('a') as file:
        file.write(separator + entry)
    print(f'Added {args.name} with listing date {date}')


if __name__ == '__main__':
    main()
