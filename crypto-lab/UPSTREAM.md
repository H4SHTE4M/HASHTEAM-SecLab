# Upstream

Crypto Lab was imported from
[`JnamerZ/static-crypto-101-lab`](https://github.com/JnamerZ/static-crypto-101-lab)
at commit `7df8cd8f1d36c5fe87710e34d2cccc0b57ea3e40` (2026-08-26).

Only the current static application and its four test files were imported. The
upstream Git metadata and archived implementation were intentionally excluded.

The integration keeps the application dependency-free while adapting its theme,
progress storage, navigation, and filesystem layout for HASHTEAM Security Lab.

## English n-gram data

`crypto/english-ngrams.js` embeds the first 2,000 trigram rows and first 3,000
quadgram rows from John Burkardt's `ngrams` dataset. The dataset page distributes
the data files under the GNU Lesser General Public License version 3:

<https://people.sc.fsu.edu/~jburkardt/datasets/ngrams/ngrams.html>

During import, both embedded sequences and their declared total counts were
checked against the complete source data files.
