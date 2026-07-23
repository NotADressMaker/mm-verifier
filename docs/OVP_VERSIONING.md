# OVP versioning

OVP uses `major.minor.patch` versions. A patch clarifies documentation or fixes
an implementation without changing valid payload interpretation. A minor
version adds optional fields or extension values while preserving older
consumers. A major version may change required fields or meaning.

Producers MUST emit `ovp_version`. Consumers MUST reject unsupported major
versions, preserve unrecognized `x-` extension fields, and avoid treating a
missing extension as evidence. A verification run is immutable: changed input,
evidence, policy, or checker version produces a new run linked through
provenance rather than overwriting the previous record.
