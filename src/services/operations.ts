export class Operations {
  private pending=new Set<Promise<void>>();
  private stopping=false;
  run(work:()=>Promise<void>) {
    if(this.stopping)return;
    const task=Promise.resolve().then(work);
    this.pending.add(task);
    return task.finally(()=>this.pending.delete(task));
  }
  async drain(timeoutMs=20_000) {
    this.stopping=true;
    if(!this.pending.size)return true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      return await Promise.race([
        Promise.allSettled([...this.pending]).then(()=>true),
        new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);}),
      ]);
    } finally {clearTimeout(timer);}
  }
}
