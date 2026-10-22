from PIL import Image, ImageDraw, ImageFont
import sys, json
FB='/usr/share/fonts/google-noto-cjk/NotoSansSC-Bold.otf'; FR='/usr/share/fonts/google-noto-cjk/NotoSansSC-Regular.otf'
def sheet(title, tiles, cols, tw, out):
    fT=ImageFont.truetype(FB,40); fL=ImageFont.truetype(FB,28); fS=ImageFont.truetype(FR,22)
    ims=[]
    for p,l,s,star in tiles:
        im=Image.open('out/'+p).convert('RGB'); r=tw/im.width; im=im.resize((tw,int(im.height*r)),Image.LANCZOS); ims.append((im,l,s,star))
    rows=[ims[i:i+cols] for i in range(0,len(ims),cols)]
    pad=28; cap=86; head=96
    rh=[max(x[0].height for x in r)+cap for r in rows]
    W=pad+cols*(tw+pad); H=head+sum(rh)+pad*len(rows)+pad
    S=Image.new('RGB',(W,H),(236,236,239)); d=ImageDraw.Draw(S)
    d.text((pad,28),title,font=fT,fill=(10,10,10))
    y=head
    for r,h in zip(rows,rh):
        x=pad
        for im,l,s,star in r:
            col=(10,10,10)
            if star: d.rounded_rectangle((x,y,x+64,y+34),radius=17,fill=(10,10,10)); d.text((x+12,y+2),star,font=fS,fill=(255,255,255)); lx=x+76
            else: lx=x
            d.text((lx,y),l,font=fL,fill=col); d.text((x,y+40),s,font=fS,fill=(82,82,91))
            S.paste(im,(x,y+cap)); d.rectangle((x,y+cap,x+tw-1,y+cap+im.height-1),outline=(212,212,216))
            x+=tw+pad
        y+=h+pad
    S.save(out, optimize=True); print(out,S.size)
J=json.load(open(sys.argv[1]))
for s in J: sheet(s['title'],s['tiles'],s['cols'],s['tw'],s['out'])
