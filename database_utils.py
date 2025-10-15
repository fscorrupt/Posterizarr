#!/usr/bin/env python3
"""
Database Query Utilities for Posterizarr
Provides convenient functions to query the ImageChoices database
"""

import sqlite3
from pathlib import Path
from typing import List, Dict, Optional, Tuple


class ImageChoicesDB:
    """Database interface for ImageChoices"""
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize database connection
        
        Args:
            db_path: Path to database file. If None, uses default location.
        """
        if db_path is None:
            script_dir = Path(__file__).parent
            db_path = str(script_dir / "database" / "posterizarr.db")
        
        self.db_path = db_path
        self.conn = None
    
    def __enter__(self):
        """Context manager entry"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row  # Enable column access by name
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        if self.conn:
            self.conn.close()
    
    def get_all_records(self) -> List[Dict]:
        """Get all records from the database"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM image_choices ORDER BY title")
        return [dict(row) for row in cursor.fetchall()]
    
    def get_by_title(self, title: str) -> List[Dict]:
        """
        Get all records for a specific title
        
        Args:
            title: Movie/Show title to search for
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM image_choices 
            WHERE title = ? 
            ORDER BY type
        """, (title,))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_by_library(self, library_name: str) -> List[Dict]:
        """
        Get all records for a specific library
        
        Args:
            library_name: Library name (e.g., 'DC', '4K', 'Animation')
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM image_choices 
            WHERE library_name = ? 
            ORDER BY title, type
        """, (library_name,))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_by_type(self, image_type: str) -> List[Dict]:
        """
        Get all records of a specific type
        
        Args:
            image_type: Type of image (e.g., 'Movie', 'Movie Background')
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM image_choices 
            WHERE type = ? 
            ORDER BY title
        """, (image_type,))
        return [dict(row) for row in cursor.fetchall()]
    
    def search_title(self, search_term: str) -> List[Dict]:
        """
        Search for titles containing the search term
        
        Args:
            search_term: Text to search for in titles
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM image_choices 
            WHERE title LIKE ? 
            ORDER BY title, type
        """, (f'%{search_term}%',))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_textless_images(self) -> List[Dict]:
        """Get all textless images"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM image_choices 
            WHERE language = 'Textless' 
            ORDER BY title
        """)
        return [dict(row) for row in cursor.fetchall()]
    
    def get_fallback_images(self) -> List[Dict]:
        """Get all images that were fallbacks"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM image_choices 
            WHERE fallback = 'true' 
            ORDER BY title
        """)
        return [dict(row) for row in cursor.fetchall()]
    
    def get_statistics(self) -> Dict:
        """Get database statistics"""
        cursor = self.conn.cursor()
        
        # Total records
        cursor.execute("SELECT COUNT(*) FROM image_choices")
        total_records = cursor.fetchone()[0]
        
        # Unique titles
        cursor.execute("SELECT COUNT(DISTINCT title) FROM image_choices")
        unique_titles = cursor.fetchone()[0]
        
        # Libraries
        cursor.execute("SELECT COUNT(DISTINCT library_name) FROM image_choices")
        total_libraries = cursor.fetchone()[0]
        
        # Records per library
        cursor.execute("""
            SELECT library_name, COUNT(*) as count 
            FROM image_choices 
            GROUP BY library_name 
            ORDER BY count DESC
        """)
        libraries = [{"library": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        # Records per type
        cursor.execute("""
            SELECT type, COUNT(*) as count 
            FROM image_choices 
            GROUP BY type 
            ORDER BY count DESC
        """)
        types = [{"type": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        # Language distribution
        cursor.execute("""
            SELECT language, COUNT(*) as count 
            FROM image_choices 
            GROUP BY language 
            ORDER BY count DESC
        """)
        languages = [{"language": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        return {
            "total_records": total_records,
            "unique_titles": unique_titles,
            "total_libraries": total_libraries,
            "libraries": libraries,
            "types": types,
            "languages": languages
        }
    
    def get_images_by_source(self, source: str) -> List[Dict]:
        """
        Get all images from a specific source (fanart.tv, tmdb, etc.)
        
        Args:
            source: Source domain to filter by
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM image_choices 
            WHERE download_source LIKE ? 
            ORDER BY title
        """, (f'%{source}%',))
        return [dict(row) for row in cursor.fetchall()]
    
    def add_record(self, title: str, image_type: str, rootfolder: str,
                   library_name: str, language: str, fallback: str,
                   text_truncated: str, download_source: str,
                   fav_provider_link: str) -> int:
        """
        Add a new record to the database
        
        Returns:
            ID of the newly created record
        """
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO image_choices 
            (title, type, rootfolder, library_name, language, 
             fallback, text_truncated, download_source, fav_provider_link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (title, image_type, rootfolder, library_name, language,
              fallback, text_truncated, download_source, fav_provider_link))
        
        self.conn.commit()
        return cursor.lastrowid
    
    def update_record(self, record_id: int, **kwargs) -> bool:
        """
        Update a record by ID
        
        Args:
            record_id: ID of record to update
            **kwargs: Fields to update (title, type, language, etc.)
        
        Returns:
            True if record was updated, False otherwise
        """
        if not kwargs:
            return False
        
        # Build UPDATE query dynamically
        fields = ", ".join([f"{key} = ?" for key in kwargs.keys()])
        values = list(kwargs.values())
        values.append(record_id)
        
        cursor = self.conn.cursor()
        cursor.execute(f"""
            UPDATE image_choices 
            SET {fields}
            WHERE id = ?
        """, values)
        
        self.conn.commit()
        return cursor.rowcount > 0
    
    def delete_record(self, record_id: int) -> bool:
        """
        Delete a record by ID
        
        Args:
            record_id: ID of record to delete
        
        Returns:
            True if record was deleted, False otherwise
        """
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM image_choices WHERE id = ?", (record_id,))
        self.conn.commit()
        return cursor.rowcount > 0


def main():
    """Example usage"""
    print("=== Posterizarr Database Query Tool ===\n")
    
    # Example queries
    with ImageChoicesDB() as db:
        # Get statistics
        stats = db.get_statistics()
        print(f"Total Records: {stats['total_records']}")
        print(f"Unique Titles: {stats['unique_titles']}")
        print(f"Total Libraries: {stats['total_libraries']}\n")
        
        print("=== Libraries ===")
        for lib in stats['libraries']:
            print(f"  {lib['library']}: {lib['count']} records")
        
        print("\n=== Image Types ===")
        for img_type in stats['types']:
            print(f"  {img_type['type']}: {img_type['count']} records")
        
        print("\n=== Languages ===")
        for lang in stats['languages']:
            print(f"  {lang['language']}: {lang['count']} records")
        
        # Example: Search for Batman
        print("\n=== Search Example: 'Batman' ===")
        batman_records = db.search_title("Batman")
        print(f"Found {len(batman_records)} records")
        for record in batman_records[:5]:  # Show first 5
            print(f"  - {record['title']} ({record['type']})")


if __name__ == "__main__":
    main()
