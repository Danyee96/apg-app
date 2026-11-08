import os,pathlib,subprocess
from integration import main

def check(base,database,password):
 subprocess.run(['node',str(pathlib.Path(__file__).with_suffix('.mjs'))],env=dict(os.environ,APG_TEST_URL=base.split('/api.php?')[0],APG_TEST_PASSWORD=password),check=True)
if __name__=='__main__':main(check)
