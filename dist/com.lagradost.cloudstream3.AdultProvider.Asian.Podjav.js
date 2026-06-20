
const baseUrl = "https://podjav.tv";

function getHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Referer": baseUrl,
    };
}

export async function getHome() {
    const list1 = await getPage(baseUrl + "/genre/affair/");
    const list2 = await getPage(baseUrl + "/genre/abuse/");
    const list3 = await getPage(baseUrl + "/genre/cuckold/");
    
    return [
        { title: "Perselingkuhan", list: list1 },
        { title: "Pelecehan", list: list2 },
        { title: "Istri Tidak Setia", list: list3 }
    ];
}

async function getPage(url) {
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

export async function search(query) {
    const url = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(url, getHeaders());
    return parseList(res);
}

function parseList(html) {
    const results = [];
    const items = html.split(/<a[^>]*class=["'][^"']*video-card[^"']*["']/i);
    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        if(item.includes("banner-card")) continue;
        
        let aTag = items[i-1].match(/<a[^>]*class=["'][^"']*video-card[^"']*["'][^>]*$/i);
        if(!aTag) continue;
        const mainMatch = aTag[0] + item;
        
        let hrefMatch = mainMatch.match(/href=["'](https?:\/\/[^"']+)["']/i);
        if(!hrefMatch) continue;
        
        let titleMatch = item.match(/<[^>]*class=["'][^"']*card-title[^"']*["'][^>]*>(.*?)<\//i) || item.match(/data-title=["']([^"']+)["']/i);
        let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Unknown";
        
        let imgMatch = item.match(/<img[^>]*class=["'][^"']*thumb[^"']*["'][^>]*src=["']([^"']+)["']/i) || item.match(/<img[^>]+src=["']([^"']+)["']/i);
        
        let isUncensored = item.includes("badge-uncen") || (item.match(/data-genre=["']([^"']+)["']/i) && item.match(/data-genre=["']([^"']+)["']/i)[1].toLowerCase().includes("uncensored"));
        if(isUncensored) title = `🔥 [UNCENSORED] ${title}`;

        results.push({
            url: hrefMatch[1],
            title: title,
            poster: imgMatch ? imgMatch[1] : ''
        });
    }
    return results;
}

export async function load(url) {
    const res = await http_get(url, getHeaders());
    
    let title = url;
    const titleMatch = res.match(/<h1[^>]*class=["'][^"']*video-info-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if(titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    let poster = "";
    const posterMatch = res.match(/<div class=["']video-info-top["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    if(posterMatch) poster = posterMatch[1];
    
    return {
        url: url,
        title: title,
        poster: poster,
        links: [url],
        isMovie: true
    };
}

export async function loadLinks(url) {
    const res = await http_get(url, getHeaders());
    const results = [];
    
    const podjavPlayer = res.match(/<div[^>]*id=["']podjavPlayer["'][^>]*>/i);
    if(podjavPlayer) {
         const dataSources = podjavPlayer[0].match(/data-sources=["']([^"']+)["']/i);
         if(dataSources) {
              const decoded = dataSources[1].replace(/&quot;/g, '"');
              try {
                  const sources = JSON.parse(decoded);
                  for(let s of sources) {
                       if(s.url) {
                            if(s.type === "mp4" || s.type === "m3u8" || s.url.includes(".mp4") || s.url.includes(".m3u8")) {
                                 results.push({
                                      url: s.url,
                                      quality: s.label || "Podjav",
                                      isM3U8: s.type === "m3u8" || s.url.includes(".m3u8")
                                 });
                            } else if (s.type === "embed") {
                                 const extr = await loadExtractor(s.url);
                                 if (extr) {
                                     extr.forEach(e => results.push(e));
                                 }
                            }
                       }
                  }
              } catch(e) {}
         }
         
         const dataSubtitles = podjavPlayer[0].match(/data-subtitles=["']([^"']+)["']/i);
         if(dataSubtitles) {
              const decoded = dataSubtitles[1].replace(/&quot;/g, '"');
              try {
                  const subs = JSON.parse(decoded);
                  for(let sub of subs) {
                       if(sub.src) {
                            results.push({
                                url: sub.src.startsWith("//") ? "https:" + sub.src : sub.src,
                                language: sub.label || "English",
                                quality: "Subtitle",
                                isM3U8: false
                            });
                       }
                  }
              } catch(e) {}
         }
    }
    
    if(results.length === 0) {
        let embedMatch = res.match(/<iframe[^>]*id=["']podjavEmbed["'][^>]*src=["']([^"']+)["']/i) || 
                         res.match(/<div class=["']player-wrapper["'][^>]*>[\s\S]*?<iframe[^>]+src=["']([^"']+)["']/i) ||
                         res.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if(embedMatch && !embedMatch[1].includes("blank")) {
             let embed = embedMatch[1];
             if(embed.startsWith("//")) {
                 embed = "https:" + embed;
             }
             const extr = await loadExtractor(embed);
             if (extr) {
                 extr.forEach(e => results.push(e));
             }
        }
    }
    
    return results;
}
