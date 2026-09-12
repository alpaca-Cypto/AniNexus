# Public catalog bundle

Place the published `aninexus-public-catalog.jsonl.gz` file in this directory.
The archive is intentionally not committed by default because its size and
redistribution terms must be reviewed before release.

Generate it as the dataset publisher:

```powershell
aninexus-export-public-data
```

Import it as a project user:

```powershell
aninexus-import-public-data
```
