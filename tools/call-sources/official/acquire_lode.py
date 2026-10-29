"""Compatibility entry point for the pinned LODE facility sources (no ODBus)."""
from acquire_snapshot import main
if __name__ == '__main__':
    main(default_group='lode')
