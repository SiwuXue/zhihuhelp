"""Resume a release by ID, including drafts left behind by failed API requests."""

import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import quote


def api(endpoint, *args):
    # gh prints the HTTP status and error body to stderr on failure.
    result = subprocess.run(
        ['gh', 'api', endpoint, *args], check=True, stdout=subprocess.PIPE, encoding='utf-8'
    )
    return json.loads(result.stdout) if result.stdout.strip() else None


def retry(operation):
    for attempt in range(5):
        try:
            return operation()
        except subprocess.CalledProcessError:
            if attempt == 4:
                raise
            delay = 15 * (2 ** attempt)
            print(f'Request failed; retrying in {delay}s', flush=True)
            time.sleep(delay)


def main():
    repo = os.environ['GH_REPO']
    tag = os.environ['RELEASE_TAG']
    base = f'repos/{repo}'
    files = sorted(p for p in Path('artifacts').rglob('*') if p.suffix in {'.exe', '.msi', '.dmg', '.zip'})
    if not files or len({p.name for p in files}) != len(files):
        raise RuntimeError('Release files are missing or have duplicate names')
    # Never implicitly create a tag from the default branch.
    retry(lambda: api(f'{base}/git/ref/tags/{quote(tag, safe="")}'))

    def ensure_release():
        pages = api(f'{base}/releases?per_page=100', '--paginate', '--slurp')
        matches = [r for page in pages for r in page if r['tag_name'] == tag]
        if matches:
            # Prefer a published release, otherwise deterministically reuse the oldest draft.
            return min(matches, key=lambda r: (r['draft'], r['id']))
        return api(
            f'{base}/releases', '-X', 'POST', '-f', f'tag_name={tag}',
            '-f', f'name={os.environ["RELEASE_NAME"]}', '-f', f'body={os.environ["RELEASE_BODY"]}',
            '-F', 'draft=true', '-F', 'prerelease=false',
        )

    # Re-list on every retry: a 500 may still have created a draft server-side.
    release = retry(ensure_release)
    release_id = release['id']
    print(f'Using release ID {release_id} for {tag}', flush=True)
    upload_url = release['upload_url'].split('{')[0]
    for path in files:
        def upload():
            pages = api(f'{base}/releases/{release_id}/assets?per_page=100', '--paginate', '--slurp')
            for page in pages:
                for asset in page:
                    if asset['name'] == path.name:
                        api(f'{base}/releases/assets/{asset["id"]}', '-X', 'DELETE')
            # Always use the chosen ID's upload URL; several drafts can share a tag.
            api(
                f'{upload_url}?name={quote(path.name, safe="")}', '-X', 'POST',
                '-H', 'Content-Type: application/octet-stream', '--input', str(path),
            )

        print(f'Uploading {path.name}', flush=True)
        retry(upload)

    published = retry(lambda: api(
        f'{base}/releases/{release_id}', '-X', 'PATCH',
        '-f', f'name={os.environ["RELEASE_NAME"]}', '-f', f'body={os.environ["RELEASE_BODY"]}',
        '-F', 'draft=false', '-F', 'prerelease=false',
    ))
    print(f'Release published: {published["html_url"]}', flush=True)


if __name__ == '__main__':
    main()
