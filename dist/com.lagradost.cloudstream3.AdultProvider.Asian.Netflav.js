
const baseUrl = "https://netflav.com";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl + "/",
        "Cookie": "i18next=en"
    };
}

export async function getHome() {
    return [
        { title: "Censored", list: await getPage(baseUrl + "/censored?page=1") },
        { title: "Uncensored", list: await getPage(baseUrl + "/uncensored?page=1") },
        { title: "Chinese sub", list: await getPage(baseUrl + "/chinese-sub?page=1") }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/search?type=title&keyword=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const scriptMatch = html.match(/<script[^>]*>([\s\S]*?preview_hp[\s\S]*?)<\/script>/i);
    let scriptData = scriptMatch ? scriptMatch[1] : "";

    const items = html.split(/class=["']grid_0_cell["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        
        let aTag = item.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/i) || item.match(/href=["']([^"']+)["']/i);
        if(!aTag) continue;
        
        let titleMatch = item.match(/<div class=["']grid_0_title["'][^>]*>(.*?)<\/div>/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let href = aTag[1];
        if(!href.startsWith("http")) href = baseUrl + href;
        
        let code = title.split(" ")[0].replace(/\[.*?\]/g, '').trim();
        if(!code && title.split(" ").length > 1) {
             code = title.split(" ")[0] + " " + title.split(" ")[1];
             code = code.replace(/\[.*?\]/g, '').trim();
        }
        
        let poster = "";
        let pMatch = scriptData.match(new RegExp(`"code":"${code}","preview_hp":"([^"]+)"`));
        if(!pMatch && code.length > 1) {
            let code2 = code.substring(1);
            pMatch = scriptData.match(new RegExp(`"code":"${code2}","preview_hp":"([^"]+)"`));
        }
        if(!pMatch) {
             pMatch = scriptData.match(new RegExp(`"code":"([^"]+)"[\\s\\S]*?"preview":"([^"]+)"`)); // Fallback
        }
        if(pMatch && pMatch[1].startsWith("http")) {
             poster = pMatch[1];
        } else if(pMatch && pMatch.length > 2 && pMatch[2].startsWith("http")) {
             poster = pMatch[2];
        }

        results.push({
            url: href,
            title: title,
            poster: poster
        });
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<div class=["']videodetail_2_title["'][^>]*>([\s\S]*?)<\/div>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    const imageMatch = res.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    let poster = imageMatch ? imageMatch[1] : "";
    
    const scriptMatch = res.match(/,"src":"https:\/\/([^"]+)"/);
    let link = "";
    if(scriptMatch) {
        link = "https://" + scriptMatch[1];
    } else {
        link = url; // fallback
    }

    return {
        url: url,
        title: title,
        poster: poster,
        links: [link],
        isMovie: true
    };
}

function unpack(packed) {
    const pattern = /}\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(\d+),\s*'((?:[^'\\]|\\.)*)'/;
    const match = pattern.exec(packed);
    if (!match) return packed;

    let p = match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    const a = parseInt(match[2], 10);
    const c = parseInt(match[3], 10);
    const k = match[4].split('|');

    for (let i = c - 1; i >= 0; i--) {
        if (k[i]) {
            const token = i.toString(a);
            const regex = new RegExp(`\\b${token}\\b`, 'gi');
            p = p.replace(regex, k[i]);
        }
    }
    return p;
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const results = [];
    
    const scripts = res.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scripts) {
        for (let s of scripts) {
            if (s.includes("eval(function(p,a,c,k,e,d)")) {
                const unpacked = unpack(s);
                let m4 = unpacked.match(/"hls4":"([^"]+)"/);
                let m2 = unpacked.match(/"hls2":"([^"]+)"/);
                
                if(m4 && m4[1]) {
                    results.push({
                        url: m4[1].startsWith("//") ? "https:" + m4[1] : m4[1],
                        quality: "Unknown",
                        isM3U8: true,
                    });
                }
                if(m2 && m2[1]) {
                    results.push({
                        url: m2[1].startsWith("//") ? "https:" + m2[1] : m2[1],
                        quality: "Unknown",
                        isM3U8: true,
                    });
                }
            }
        }
    }
    
    return results;
}
