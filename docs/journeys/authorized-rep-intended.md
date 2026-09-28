# Authorized representative — intended

A dad watches both kids' credit files. He is not an affiliate. Staff add him. He signs in with his own email link. On each linked file he can do what the kid can do. Texts and emails for those files go to him.

```mermaid
flowchart TD
  A[Staff add his name, email, and phone to a file] --> B[He is linked to that file]
  B --> C[He can be linked to another file too]
  C --> D[He opens the email link and signs in]
  D --> E[The portal opens the first file]
  E --> F[He switches to the other file]
  F --> G[Texts and emails for either file go to him]
  H[A file with nobody linked] --> I[Texts and emails still go to that client]
```

One live person per file. Adding someone else takes the previous person off that file. A file he is not linked to does not open.
