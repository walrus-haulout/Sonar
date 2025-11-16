#!/usr/bin/env python3
"""
Setup user for Docker container running on NixOS.
Creates /etc/passwd and /etc/group files and adds the backend user.
"""
import os
import stat
from pathlib import Path


def ensure_file_exists(filepath: Path, mode: int = 0o644):
    """Create file if it doesn't exist and set permissions."""
    if not filepath.exists():
        filepath.touch()
        os.chmod(filepath, mode)
    return filepath


def user_exists(passwd_file: Path, username: str) -> bool:
    """Check if user already exists in passwd file."""
    if not passwd_file.exists():
        return False
    with open(passwd_file, 'r') as f:
        for line in f:
            if line.startswith(f'{username}:'):
                return True
    return False


def group_exists(group_file: Path, groupname: str) -> bool:
    """Check if group already exists in group file."""
    if not group_file.exists():
        return False
    with open(group_file, 'r') as f:
        for line in f:
            if line.startswith(f'{groupname}:'):
                return True
    return False


def add_user_entry(passwd_file: Path, username: str, uid: int, gid: int,
                   home_dir: str, shell: str = '/bin/sh'):
    """Add user entry to passwd file."""
    if user_exists(passwd_file, username):
        print(f"User {username} already exists in {passwd_file}")
        return

    entry = f"{username}:x:{uid}:{gid}:{username} user:{home_dir}:{shell}\n"
    with open(passwd_file, 'a') as f:
        f.write(entry)
    print(f"Added user {username} to {passwd_file}")


def add_group_entry(group_file: Path, groupname: str, gid: int):
    """Add group entry to group file."""
    if group_exists(group_file, groupname):
        print(f"Group {groupname} already exists in {group_file}")
        return

    entry = f"{groupname}:x:{gid}:\n"
    with open(group_file, 'a') as f:
        f.write(entry)
    print(f"Added group {groupname} to {group_file}")


def ensure_root_user(passwd_file: Path, group_file: Path):
    """Ensure root user exists in passwd and group files."""
    if not user_exists(passwd_file, 'root'):
        entry = "root:x:0:0:root:/root:/bin/sh\n"
        with open(passwd_file, 'a') as f:
            f.write(entry)
        print("Added root user to passwd file")

    if not group_exists(group_file, 'root'):
        entry = "root:x:0:\n"
        with open(group_file, 'a') as f:
            f.write(entry)
        print("Added root group to group file")


def main():
    """Main setup function."""
    # Paths
    etc_dir = Path('/etc')
    passwd_file = etc_dir / 'passwd'
    shadow_file = etc_dir / 'shadow'
    group_file = etc_dir / 'group'
    gshadow_file = etc_dir / 'gshadow'

    # Create /etc directory if it doesn't exist
    etc_dir.mkdir(parents=True, exist_ok=True)

    # Create system files with proper permissions
    ensure_file_exists(passwd_file, 0o644)
    ensure_file_exists(shadow_file, 0o600)
    ensure_file_exists(group_file, 0o644)
    ensure_file_exists(gshadow_file, 0o600)

    # Ensure root user exists
    ensure_root_user(passwd_file, group_file)

    # Create backend user
    backend_uid = 1000
    backend_gid = 0  # Use root group (GID 0)
    backend_home = Path('/home/backend')

    # Add backend user to passwd
    add_user_entry(passwd_file, 'backend', backend_uid, backend_gid,
                   str(backend_home), '/bin/sh')

    # Add backend group to group file
    add_group_entry(group_file, 'backend', backend_gid)

    # Create home directory
    backend_home.mkdir(parents=True, exist_ok=True)

    # Set ownership and permissions
    os.chown(backend_home, backend_uid, backend_gid)
    os.chmod(backend_home, 0o755)

    # Set ownership for /app
    app_dir = Path('/app')

    def chown_recursive(path: Path, uid: int, gid: int):
        """Recursively change ownership of directory and all contents."""
        os.chown(path, uid, gid)
        if path.is_dir():
            for item in path.rglob('*'):
                try:
                    os.chown(item, uid, gid)
                except OSError:
                    pass  # Skip files we can't chown

    if app_dir.exists():
        chown_recursive(app_dir, backend_uid, backend_gid)
        os.chmod(app_dir, 0o755)

    print("User setup completed successfully")


if __name__ == '__main__':
    main()
