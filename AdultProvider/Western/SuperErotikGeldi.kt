package com.lagradost.cloudstream3.AdultProvider.Western

import com.fasterxml.jackson.annotation.JsonProperty
import com.lagradost.api.Log
import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.LoadResponse.Companion.addActors
import com.lagradost.cloudstream3.LoadResponse.Companion.addTrailer
import com.lagradost.cloudstream3.extractors.helper.AesHelper
import com.lagradost.cloudstream3.utils.*
import org.jsoup.nodes.Element

class MixPlayHD : ExtractorApi() {
    override var name            = "MixPlayHD"
    override var mainUrl         = "https://mixplayhd.com"
    override val requiresReferer = true

    override suspend fun getUrl(url: String, referer: String?, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit) {
        val m3uLink: String?
        val extRef  = referer ?: ""
        val iSource = app.get(url, referer=extRef).text

        val bePlayer     = Regex("""bePlayer\('([^']+)',\s*'(\{[^}]+\})'\);""").find(iSource)?.groupValues ?: throw ErrorLoadingException("bePlayer not found")
        val bePlayerPass = bePlayer[1]
        val bePlayerData = bePlayer[2]
        val encrypted    = AesHelper.cryptoAESHandler(bePlayerData, bePlayerPass.toByteArray(), false)?.replace("\\", "") ?: throw ErrorLoadingException("failed to decrypt")
        Log.d("Kekik_${this.name}", "encrypted » $encrypted")

        m3uLink = Regex("""video_location":"([^"]+)""").find(encrypted)?.groupValues?.get(1)

        callback.invoke(
            newExtractorLink(
                source  = this.name,
                name    = this.name,
                url     = m3uLink ?: throw ErrorLoadingException("m3u link not found"),
                type = ExtractorLinkType.M3U8
            ) {
                headers = mapOf("Referer" to url)
                quality = getQualityFromName(Qualities.Unknown.value.toString())
            }
        )
    }
}

open class PlayerFilmIzle : ExtractorApi() {
    override val name = "PlayerFilmIzle"
    override val mainUrl = "https://player.filmizle.in"
    override val requiresReferer = true

    override suspend fun getUrl(
        url: String,
        referer: String?,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ) {
        val extRef = mainUrl
        val videoReq = app.get(url, referer=extRef).text

        val regex = Regex(pattern = """FirePlayer\|([^|]+)\|""", options = setOf(RegexOption.IGNORE_CASE))

        val regexSub = Regex(pattern = "playerjsSubtitle = \"([^\"]*)\"", options = setOf(RegexOption.IGNORE_CASE))

        val subYakala = regexSub.find(videoReq)?.groupValues?.get(1).toString()

        val subUrl    = subYakala.substringAfter("]")

        val subLang   = subYakala.substringBefore("]").removePrefix("[")

        Log.d("kraptor_$name","suburl = $subUrl ve sublang = $subLang")

        subtitleCallback(
            SubtitleFile(
                url = subUrl,
                lang = subLang
                )
            )

        val data = regex.find(videoReq)?.groupValues?.get(1)

        Log.d("kraptor_$name","data = $data")

        val urlPost = "https://player.filmizle.in/player/index.php?data=$data&do=getVideo"

        val getUrl  = app.post(urlPost, referer = extRef, headers = mapOf("X-Requested-With" to "XMLHttpRequest") , data = mapOf("hash" to "$data", "r" to "")).text.replace("\\","")

        Log.d("kraptor_$name","geturl = $getUrl")

        val urlYakala = Regex(pattern = """"securedLink":"([^"]*)"""", options = setOf(RegexOption.IGNORE_CASE))

        val m3u8 = urlYakala.find(getUrl)?.groupValues?.get(1).toString()

        Log.d("kraptor_$name","m3u8 = $m3u8")


        callback.invoke(
            newExtractorLink(
                source  = this.name,
                name    = this.name,
                url     = m3u8,
                type = ExtractorLinkType.M3U8
            ) {
                quality = Qualities.Unknown.value
                headers = mapOf("Referer" to extRef)
            }
        )
    }
}

open class MixTiger : ExtractorApi() {
    override val name            = "MixTiger"
    override val mainUrl         = "https://www.mixtiger.com"
    override val requiresReferer = true

    override suspend fun getUrl(url: String, referer: String?, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit) {
        val m3uLink: String?
        val extRef  = referer ?: ""
        val postUrl = "${url}?do=getVideo"
        Log.d("Kekik_${this.name}", "postUrl » $postUrl")

        val response = app.post(
            postUrl,
            data = mapOf(
                "hash" to url.substringAfter("video/"),
                "r"    to extRef,
                "s"    to ""
            ),
            referer = extRef,
            headers = mapOf(
                "Content-Type"     to "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With" to "XMLHttpRequest"
            )
        )

        val videoResponse = response.parsedSafe<FirePlayer>() ?: throw ErrorLoadingException("peace response is null")
        Log.d("Kekik_${this.name}", "videoResponse » $videoResponse")

        if (videoResponse.videoSrc != null) {
            m3uLink = videoResponse.videoSrc
            Log.d("Kekik_${this.name}", "m3uLink » $m3uLink")

            loadExtractor(m3uLink, extRef, subtitleCallback, callback)
        } else {
            val videoSources  = videoResponse.videoSources
            m3uLink = if (videoSources.isNotEmpty()) {
                videoSources.lastOrNull()?.file
            } else {
                null
            }

            Log.d("Kekik_${this.name}", "m3uLink » $m3uLink")

            callback.invoke(
                newExtractorLink(
                    source  = this.name,
                    name    = this.name,
                    url     = m3uLink ?: throw ErrorLoadingException("m3u link not found"),
                    type    = INFER_TYPE
                ) {
                    headers = mapOf("Referer" to extRef)
                    quality = getQualityFromName(Qualities.Unknown.value.toString())
                }
            )
        }
    }

    data class FirePlayer(
        @JsonProperty("videoSrc")     val videoSrc: String?               = null,
        @JsonProperty("videoSources") val videoSources: List<VideoSource> = emptyList(),
    )

    data class VideoSource(
        @JsonProperty("file")  val file: String,
        @JsonProperty("label") val label: String,
        @JsonProperty("type")  val type: String
    )
}

class SuperErotikGeldi : MainAPI() {
    init {
        val registered = extractorApis.map { it.name }.toSet()
        if ("MixPlayHD" !in registered) extractorApis.add(MixPlayHD())
        if ("PlayerFilmIzle" !in registered) extractorApis.add(PlayerFilmIzle())
        if ("MixTiger" !in registered) extractorApis.add(MixTiger())
    }

    override var mainUrl              = "https://www.superfilmgeldi8.art"
    override var name                 = "SuperErotikGeldi"
    override val hasMainPage          = true
    override var lang                 = "tr"
    override val hasQuickSearch       = false
    override val supportedTypes       = setOf(TvType.NSFW)

    private val sinezyUrl = "https://sinezy.org"

    override val mainPage = mainPageOf(
        "${mainUrl}/hdizle/category/yesilcam-erotik-izle/page/"   to "Yeşilçam Erotik",
        "${mainUrl}/hdizle/category/hd-erotik-filmler-izle/page/" to "Erotik Filmler",
        "${sinezyUrl}/izle/erotik-film-izle/"                     to "Sinezy Erotik",
        "${sinezyUrl}/izle/yetiskin-film/"                        to "Sinezy Yetişkin +18",
        "${sinezyUrl}/izle/turkce-altyazili-promo/"                 to "Sinezy Altyazılı Porno"
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        return if (request.data.lowercase().contains("sinezy.org")) {
            val document = app.get("${request.data}page/$page/").document
            val home     = document.select("div.container div.content div.movie_box.move_k").mapNotNull { it.toSinezyMainPageResult() }
            newHomePageResponse(request.name, home)
        } else {
            val document = app.get("${request.data}${page}").document
            val home     = document.select("div.movie-preview-content").mapNotNull { it.toSearchResult() }
            newHomePageResponse(request.name, home)
        }
    }

    private fun removeUnnecessarySuffixes(title: String): String {
        val unnecessarySuffixes = listOf(
            " izle",
            " full film",
            " filmini full",
            " full türkçe",
            " alt yazılı",
            " altyazılı",
            " tr dublaj",
            " hd türkçe",
            " türkçe dublaj",
            " yeşilçam ",
            " erotik fil",
            " türkçe",
            " yerli",
        )

        var cleanedTitle = title.trim()

        for (suffix in unnecessarySuffixes) {
            val regex = Regex("${Regex.escape(suffix)}.*$", RegexOption.IGNORE_CASE)
            cleanedTitle = cleanedTitle.replace(regex, "").trim()
        }

        return cleanedTitle
    }

    private fun Element.toSearchResult(): SearchResponse? {
        val title     = this.selectFirst("span.movie-title a")?.text()?.substringBefore(" izle") ?: return null
        val hrefraw   = fixUrlNull(this.selectFirst("span.movie-title a")?.attr("href")) ?: return null
        val href      = if (!hrefraw.contains("erotik")) {
            return null
        }else {
            hrefraw
        }
        val posterUrl = fixUrlNull(this.selectFirst("img")?.attr("src"))

        return newMovieSearchResponse(removeUnnecessarySuffixes(title), href, TvType.NSFW) { this.posterUrl = posterUrl }
    }

    private fun Element.toSinezyMainPageResult(): SearchResponse? {
        val title     = this.selectFirst("a")?.attr("title") ?: return null
        val href      = fixUrlNull(this.selectFirst("a")?.attr("href")) ?: return null
        val posterUrl = fixUrlNull(this.selectFirst("img")?.attr("data-src"))

        return newMovieSearchResponse(title, href, TvType.NSFW) { this.posterUrl = posterUrl }
    }

    override suspend fun search(query: String): List<SearchResponse> {
        val document = app.get("${mainUrl}?s=${query}").document

        return document.select("div.movie-preview-content").mapNotNull { it.toSearchResult() }
    }

    override suspend fun quickSearch(query: String): List<SearchResponse> = search(query)

    override suspend fun load(url: String): LoadResponse? {
        return if (url.lowercase().contains("sinezy.org")) {
            loadSinezy(url)
        } else {
            loadSuperFilmGeldi(url)
        }
    }

    private suspend fun loadSuperFilmGeldi(url: String): LoadResponse? {
        val document = app.get(url).document

        val title           = document.selectFirst("div.title h1")?.text()?.trim()?.substringBefore(" izle") ?: return null
        val poster          = fixUrlNull(document.selectFirst("div.poster img")?.attr("src"))
        val year            = document.selectFirst("div.release a")?.text()?.toIntOrNull()
        val description     = document.selectFirst("div.excerpt p")?.text()?.trim()
        val tags            = document.select("div.categories a").map { it.text() }
        val rating          = document.selectFirst("span.imdb-rating")?.text()?.trim()?.split(" ")?.first()?.toDoubleOrNull()
        val recommendations = document.select("div.film-content div.existing_item").mapNotNull { it.toSearchResult() }
        val actors          = document.select("div.actor a").map {
            Actor(it.text())
        }

        return newMovieLoadResponse(removeUnnecessarySuffixes(title), url, TvType.NSFW, url) {
            this.posterUrl       = poster
            this.year            = year
            this.plot            = description
            this.tags            = tags
            this.score           = Score.from10(rating)
            this.recommendations = recommendations
            addActors(actors)
        }
    }

    private suspend fun loadSinezy(url: String): LoadResponse? {
        val document = app.get(url).document

        val title           = document.selectFirst("div.detail")?.attr("title") ?: return null
        val poster          = fixUrlNull(document.selectFirst("div.move_k img")?.attr("data-src"))
        val description     = document.selectFirst("div.desc.yeniscroll p")?.text()?.trim()
        val year            = document.selectFirst("div.move_k span.year span")?.text()?.trim()?.toIntOrNull()
        val tags            = document.select("div.detail span a").map { it.text() }
        val rating          = document.selectFirst("span.info span.imdb")?.text()?.trim()?.toDoubleOrNull()
        val duration        = document.selectFirst("div.detail > span:nth-child(1) > span:nth-child(2) > p:nth-child(1)")
            ?.text()
            ?.replace(" Dakika","")
            ?.trim()?.toIntOrNull()
        val actors = document.select("span.oyn p")
            .flatMap { it.text().split(",") }
            .map { Actor(it.trim()) }
        val trailer         = Regex("""embed\/(.*)\?rel""").find(document.html())?.groupValues?.get(1)?.let { "https://www.youtube.com/embed/$it" }

        return newMovieLoadResponse(title, url, TvType.NSFW, url) {
            this.posterUrl       = poster
            this.plot            = description
            this.year            = year
            this.tags            = tags
            this.score           = Score.from10(rating)
            this.duration        = duration
            addActors(actors)
            addTrailer(trailer)
        }
    }

    override suspend fun loadLinks(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        return if (data.lowercase().contains("sinezy.org")) {
            loadLinksSinezy(data, isCasting, subtitleCallback, callback)
        } else {
            loadLinksSuperFilmGeldi(data, isCasting, subtitleCallback, callback)
        }
    }

    private suspend fun loadLinksSuperFilmGeldi(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        Log.d("SFG", "data » $data")
        val document = app.get(data).document
        val iframe   = fixUrlNull(document.selectFirst("div#vast iframe")?.attr("src")) ?: return false
        Log.d("SFG", "iframe » $iframe")

        if (iframe.contains("mix") and iframe.contains("index.php?data=")) {
            val iSource  = app.get(iframe, referer="${mainUrl}/").text
            val mixPoint = Regex("""videoUrl":"(.*)","videoServer""").find(iSource)?.groupValues?.get(1)?.replace("\\", "") ?: return false

            var endPoint = "?s=0&d="

            if (iframe.contains("mixlion")) {
                endPoint = "?s=3&d="
            } else if (iframe.contains("mixeagle")) {
                endPoint = "?s=1&d="
            }

            val m3uLink = iframe.substringBefore("/player") + mixPoint + endPoint
            Log.d("SFG", "m3uLink » $m3uLink")

            callback.invoke(
                newExtractorLink(
                    source  = this.name,
                    name    = this.name,
                    url     = m3uLink,
                    type = ExtractorLinkType.M3U8
                ) {
                    headers = mapOf("Referer" to iframe)
                    quality = getQualityFromName(Qualities.Unknown.value.toString())
                }
            )
        } else {
            loadExtractor(iframe, "${mainUrl}/", subtitleCallback, callback)
        }

        return true
    }

    private suspend fun loadLinksSinezy(data: String, isCasting: Boolean, subtitleCallback: (SubtitleFile) -> Unit, callback: (ExtractorLink) -> Unit): Boolean {
        Log.d("kraptor_${this.name}", "data = ${data}")
        val document = app.get(data).text

        val regex = Regex(pattern = """ilkpartkod = '([^']*)';""", options = setOf(RegexOption.IGNORE_CASE))

        val findreg = regex.find(document)?.groupValues?.get(1).toString()

        val reqCoz  = base64Decode(findreg)

        val iframe  = reqCoz.substringAfter("src=").substringBefore(" ").replace("\"","")

        Log.d("kraptor_${this.name}", "iframe = ${iframe}")

        loadExtractor(iframe, "${sinezyUrl}/", subtitleCallback, callback)

        return true
    }
}
