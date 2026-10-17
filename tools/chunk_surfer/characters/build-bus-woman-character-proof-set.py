"""Retain the final garment, contact and ready-retrieval proof views."""
import sys,runpy
from pathlib import Path
proof=Path(__file__).with_name('build-bus-woman-character-proof.py')
for mode,time,view in [
 ('wait','4','three-quarter'),('wait','4','front-close'),
 ('search','1.25','three-quarter'),
 ('receive','1.1','three-quarter'),('receive','2.949','three-quarter'),
 ('ticket-wait','4','three-quarter'),('ticket-wait','4','front'),('ticket-wait','4','side'),
 ('ready','.90','front-close'),('ready','1.2','front-close'),('ready','2','front-close')
]:
 sys.argv=[str(proof),'--',mode,time,view]
 runpy.run_path(str(proof),run_name='__main__')
