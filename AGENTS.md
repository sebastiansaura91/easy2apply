# Architecture rules
- Store CV spacing presets in content metadata and resolve them through one shared layout module for preview and PDF; this keeps all export callers consistent without changing document text.
- Measure spacing recommendations with the real PDF renderer and require explicit approval; never promise two pages when the unchanged content cannot fit safely.