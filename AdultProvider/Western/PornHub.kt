// ! Bu araç @Kraptor123 tarafından | @Cs-GizliKeyif için yazılmıştır.

package com.lagradost.cloudstream3.AdultProvider.Western

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.module.kotlin.readValue
import org.jsoup.nodes.Element
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addActors
import com.lagradost.cloudstream3.LoadResponse.Companion.addTrailer
import org.jsoup.Jsoup

class PornHub : MainAPI() {
    override var mainUrl              = "https://www.pornhub.com"
    override var name                 = "PornHub"
    override val hasMainPage          = true
    override var lang                 = "en"
    override val hasQuickSearch       = false
    override val supportedTypes       = setOf(TvType.NSFW)

    private val cookies = mapOf(Pair("hasVisited", "1"), Pair("accessAgeDisclaimerPH", "1"))

    override val mainPage = mainPageOf(
        "${mainUrl}/video"                  to "Featured",
        "${mainUrl}/categories/teen"                  to "18-25",
        "${mainUrl}/video?c=105"                      to "60FPS",
        "${mainUrl}/video?c=3"                        to "Amateur",
        "${mainUrl}/video?c=35"                       to "Anal",
        "${mainUrl}/video?c=98"                       to "Arab",
        "${mainUrl}/video?c=1"                        to "Asian",
        "${mainUrl}/categories/babe"                  to "Babe",
        "${mainUrl}/video?c=4"                        to "Big Ass",
        "${mainUrl}/video?c=9"                        to "Blonde",
        "${mainUrl}/video?c=11"                       to "Brunette",
        "${mainUrl}/video?c=14"                       to "Bukkake",
        "${mainUrl}/video?c=241"                      to "Cosplay",
        "${mainUrl}/video?c=17"                       to "Ebony",
        "${mainUrl}/hd"                               to "HD Porn",
        "${mainUrl}/video?c=28"                       to "Mature",
        "${mainUrl}/video?c=29"                       to "MILF",
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val document = if (request.data.contains("video?")){
            app.get("${request.data}&page=$page", referer = "${mainUrl}/", cookies = cookies).document
        } else {
            app.get("${request.data}?page=$page", referer = "${mainUrl}/", cookies = cookies).document
        }
        val home     = document.select("div.gridWrapper li.pcVideoListItem").mapNotNull { it.toMainPageResult() }

        return newHomePageResponse(HomePageList(request.name, home, true))
    }

    private fun Element.toMainPageResult(): SearchResponse? {
        val title     = this.selectFirst("img")?.attr("alt") ?: return null
        val href      = fixUrlNull(this.selectFirst("a")?.attr("href")) ?: return null
        val posterUrl = fixUrlNull(this.selectFirst("img")?.attr("src"))

        return newMovieSearchResponse(title, href, TvType.NSFW) {
            this.posterUrl = posterUrl
            this.posterHeaders = mapOf(
                "Referer" to "https://www.pornhub.com/",
                "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0"
            )
        }
    }


    override suspend fun search(query: String, page: Int): SearchResponseList {
        val document = app.get("${mainUrl}/video/search?search=$query&page=$page").document

        val aramaCevap = document.select("div.gridWrapper li.pcVideoListItem").mapNotNull { it.toMainPageResult() }
        return newSearchResponseList(aramaCevap, hasNext = true)
    }


    override suspend fun quickSearch(query: String): List<SearchResponse>? = search(query)

    override suspend fun load(url: String): LoadResponse? {
        val parts = url.split("kraptor")
        val videourl = if (parts.isNotEmpty()) parts[0] else url
        val trailerurl = if (parts.size >= 2) "https://${parts[1]}" else null
        val document = app.get(videourl, referer = videourl, cookies = cookies).document
        val baslik = document.selectFirst("h1")?.text()?.trim() ?: return null

        val noscriptTag = document.selectFirst("noscript:has(img.videoElementPoster)")
        val poster = if (noscriptTag != null) {
            Jsoup.parse(noscriptTag.html()).selectFirst("img")?.attr("src")
        } else {
            document.selectFirst("img.videoElementPoster")?.attr("src")
        }

        val aciklama = document.selectFirst("meta[property=og:description]")?.attr("content")?.trim()
        val etiketler = document.select("div.tagsWrapper a").map { it.text() }
        val sure = document.selectFirst("var.duration")?.text()?.split(":")?.first()?.trim()?.toIntOrNull()

        val recommendations = document.select("li.pcVideoListItem").mapNotNull { oge ->
            val link = oge.selectFirst("a.thumbnailTitle") ?: oge.selectFirst("a[href*='view_video.php']")
            val href = link?.attr("href") ?: return@mapNotNull null

            val resim = oge.selectFirst("img")
            val recbaslik = link.attr("data-title").ifBlank { resim?.attr("alt") }?.trim() ?: return@mapNotNull null

            if (recbaslik.matches(Regex("""\d+:\d+"""))) return@mapNotNull null

            val recposter = resim?.attr("data-mediumthumb")?.takeIf { it.isNotBlank() } ?: resim?.attr("src")

            if (recposter.isNullOrBlank() || recposter.contains("data:image")) return@mapNotNull null

            newMovieSearchResponse(recbaslik, fixUrl(href), TvType.NSFW) {
                this.posterUrl = fixUrlNull(recposter)
                this.posterHeaders = mapOf("Referer" to "$mainUrl/")
            }
        }

        val aktorler = document.select("a.pstar-list-btn").map {
            Actor(it.text(), it.selectFirst("img.avatar")?.attr("src"))
        }

        return newMovieLoadResponse(baslik, videourl, TvType.NSFW, videourl) {
            this.posterUrl = fixUrlNull(poster)
            this.posterHeaders = mapOf("Referer" to "$mainUrl/")
            this.plot = aciklama
            this.tags = etiketler
            this.duration = sure
            this.recommendations = recommendations
            addActors(aktorler)
            if (trailerurl != null) {
                addTrailer(trailerurl, "$mainUrl/", true)
            }
        }
    }

    override suspend fun loadLinks(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        val document = app.get(data, referer = "${mainUrl}/" , cookies = cookies).document

        val script = document.selectFirst("script:containsData(var flashvars)")?.data()?.substringAfter(" = ")
            ?.substringBefore(";") ?: ""

        val mapper = mapper.readValue<Phub>(script)

        val cevaplar = mapper.mediaDefinitions

        cevaplar?.forEach { cevap ->
            val video = cevap.videoUrl ?: ""
            val quality = cevap.quality.toString()

            val format = cevap.format ?: ""
            callback.invoke(newExtractorLink(
                this.name,
                this.name,
                video,
                type = when(format){
                    "mp4" -> ExtractorLinkType.VIDEO
                    "hls" -> ExtractorLinkType.M3U8
                    else -> INFER_TYPE
                }
            ) {
                this.referer = "${mainUrl}/"
                this.quality = getQualityFromName(quality)
            })
        }

        return true
    }
}

@JsonIgnoreProperties(ignoreUnknown = true)
data class Phub(
    val mediaDefinitions: List<PhubVideo>?
)
@JsonIgnoreProperties(ignoreUnknown = true)
data class PhubVideo(
    val format: String?,
    val videoUrl: String?,
    val quality: Any?
)
