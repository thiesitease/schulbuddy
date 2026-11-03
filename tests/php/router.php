<?php

// Router für den PHP-Testserver: lädt die Testkonfiguration und liefert sonst alles normal aus.
// php -S 127.0.0.1:8090 -t public tests/php/router.php
putenv('SCHULBUDDY_CONFIG=' . __DIR__ . '/test-config.php');
return false;
