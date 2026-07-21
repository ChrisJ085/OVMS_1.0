# OVMS Architecture

- Authentication is intentionally deferred until Phase 19.
- Every relevant Firestore document will support `tenantId` and `siteId`.
- UI components must not contain Firestore CRUD implementation.
- Business calculations must live in domain services.
- Feature modules must not be collapsed into one large portal component.
- Dates use Firestore `Timestamp` values.
- The system must remain multi-site-ready.
- OVMS is decision support; planners retain final decision authority.
