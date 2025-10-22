#!/usr/bin/env python3
"""
Script to improve logging in main.py:
1. Remove all emojis
2. Add more detailed logging
3. Improve error handling with stack traces
"""

import re
from pathlib import Path

# Map emojis to text replacements
EMOJI_REPLACEMENTS = {
    "📍": "[URL]",
    "🔑": "[KEY]",
    "🌐": "[REQUEST]",
    "❌": "[FAILED]",
    "⏱️": "[TIMEOUT]",
    "💥": "[ERROR]",
    "🎟️": "[TOKEN]",
    "⏳": "[WAIT]",
    "⏭️": "[SKIP]",
    "✓": "[SUCCESS]",
}


def remove_emojis_from_file(file_path: Path):
    """Remove all emojis from a file and replace with text markers"""
    print(f"Processing {file_path}...")

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content

    # Replace known emojis
    for emoji, replacement in EMOJI_REPLACEMENTS.items():
        if emoji in content:
            count = content.count(emoji)
            content = content.replace(emoji, replacement)
            print(f"  Replaced {count} occurrences of {emoji} with {replacement}")

    # Remove any remaining emojis using regex
    # This matches most emoji unicode ranges
    emoji_pattern = re.compile(
        "["
        "\U0001f600-\U0001f64f"  # emoticons
        "\U0001f300-\U0001f5ff"  # symbols & pictographs
        "\U0001f680-\U0001f6ff"  # transport & map symbols
        "\U0001f1e0-\U0001f1ff"  # flags (iOS)
        "\U00002500-\U00002bef"  # chinese char
        "\U00002702-\U000027b0"
        "\U00002702-\U000027b0"
        "\U000024c2-\U0001f251"
        "\U0001f926-\U0001f937"
        "\U00010000-\U0010ffff"
        "\u2640-\u2642"
        "\u2600-\u2b55"
        "\u200d"
        "\u23cf"
        "\u23e9"
        "\u231a"
        "\ufe0f"  # dingbats
        "\u3030"
        "]+",
        flags=re.UNICODE,
    )

    remaining_emojis = emoji_pattern.findall(content)
    if remaining_emojis:
        print(
            f"  Found {len(remaining_emojis)} additional emojis: {set(remaining_emojis)}"
        )
        content = emoji_pattern.sub("", content)

    if content != original_content:
        # Backup original file
        backup_path = file_path.with_suffix(file_path.suffix + ".backup")
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(original_content)
        print(f"  Backup created: {backup_path}")

        # Write cleaned content
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"  ✅ File updated successfully")
        return True
    else:
        print(f"  No changes needed")
        return False


def main():
    # Process main.py
    main_py = Path(__file__).parent / "main.py"

    if not main_py.exists():
        print(f"ERROR: {main_py} not found!")
        return 1

    changed = remove_emojis_from_file(main_py)

    # Process other Python files in backend
    backend_dir = Path(__file__).parent
    for py_file in backend_dir.glob("*.py"):
        if py_file.name == "improve_logging.py":
            continue
        if py_file.name != "main.py":  # We already processed main.py
            changed_this = remove_emojis_from_file(py_file)
            changed = changed or changed_this

    if changed:
        print("\n✅ Emoji removal completed!")
        print("   Backup files created with .backup extension")
    else:
        print("\n✅ No emojis found in any files")

    return 0


if __name__ == "__main__":
    exit(main())
