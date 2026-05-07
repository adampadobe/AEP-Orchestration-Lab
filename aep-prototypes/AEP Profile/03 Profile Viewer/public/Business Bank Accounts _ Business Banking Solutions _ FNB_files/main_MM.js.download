try{
	console.log();
}
catch(e){
	console={},
	console.log=function(a){}
	console.info=function(a){}
	console.dir=function(a){}
	console.error=function(a){}
}

$( document ).ready(function() {
	// Document selectors
	var pass = document.getElementById('pass');
	var overlayPass = document.getElementById('OverlayPassword');
	var ctr = false;
	$("#LOGIN_FORM").append($('<input type="hidden" name="tp" id="tp" value="false">'));

	function keyDown(e) {
		var keyCode = e.keyCode;
		var pastePass = false;

		if (e.ctrlKey){
			ctr = true;
		}

		if ([35,36,46].indexOf(keyCode) !== -1) {
			e.preventDefault();
		}

		if (e.ctrlKey && 'v'.indexOf(e.key) !== -1) {
			pastePass = e.ctrlKey;
			$("#LOGIN_FORM #tp").val("false");
		}
		if(keyCode && !pastePass) {
			$("#LOGIN_FORM #tp").val("true");
		}
		else {
			$("#LOGIN_FORM #tp").val("false");
		}
	}
	function overlaykeyDown(e) {
		var keyCode = e.keyCode;
		var pastePass = false;

		if (e.ctrlKey){
			ctr = true;
		}

		if ([35,36,46].indexOf(keyCode) !== -1) {
			e.preventDefault();
		}

		if (e.ctrlKey && 'v'.indexOf(e.key) !== -1) {
			pastePass = e.ctrlKey;
			$("#LOGIN_FORM #tp").val("false");
		}

		if(keyCode && !pastePass) {
			$("#LOGIN_FORM #tp").val("true");
		}
		else {
			$("#LOGIN_FORM #tp").val("false");
		}
	}

	if ($('#pass').length > 0)
	{
		pass.onkeydown = keyDown;
		overlayPass.onkeydown = overlaykeyDown;
	}
	

/* ****************************************** EXPANDABLES **************************************************************** */	
	$(".expander").click(function(){
		$(this).parent().toggleClass("expanded");
	});
	

/* ****************************************** PLACEHOLDER TEXT FOR IE **************************************************************** */	
	 var ua= navigator.userAgent.toLowerCase();
	 if(ua.indexOf('msie 9.0') != -1)
{		 
	var passwordText = $(".passwordtext");
	var usernameText = $(".usernametext");
	passwordText.show();
	usernameText.show();
	
	$(".passwordtext").on("click",function(){
		$(".passWord").focus();
		$(".passwordtext").hide();
	})
	
	$(".usernametext").on("click",function(){
		$(".userName").focus();
		$(".usernametext").hide();
	})
		 
	$('[placeholder]').focus(function() {
	  var input = $(this);
	  var inputType = input.attr('placeholder').toLowerCase();

	  if(inputType == "password")
	  {$(".passwordtext").hide();}
	  
	  if(inputType == "username")
	  {$(".usernametext").hide();}
	  
	}).blur(function() {
	  var input = $(this);
	  var inputType = input.attr('placeholder').toLowerCase();
	  if (input.val() == '') {
		  if(inputType == "password")
		  {$(".passwordtext").show();}
		  
		  if(inputType == "username")
		  {$(".usernametext").show();}
	  }
	});
}

/* ****************************************** CONTACT US **************************************************************** */

$(".slide:first").addClass('firstSlide');
$(".slide:last").addClass('lastSlide');



/* ****************************************** CONTACT US **************************************************************** */	
	
$( ".contact_productSelect" ).change(function() {
	
	selector = $(this).find(':selected').attr('value');
	$('.contact_details').removeClass('formHide');
	$('.contact_details').addClass('formHide');
	$('.contact_divisionSelect').removeClass('formHide');
	$('.contact_divisionSelect').addClass('formHide');
	$('.contact_divisionSelect.'+selector).removeClass('formHide')
	
});	

$( ".contact_divisionSelect" ).change(function() {
	selector = $(this).find(':selected').attr('value');
	
	showSpecificWithinFamily(event, this, '', '.contact_details', selector);
		
});


/* ****************************************** SLIDES **************************************************************** */

/* ** setup slide names ** */ 

slideNo = 1;

$( ".slide" ).not(".slideOverlay .slide").not(".bx-viewport .slide").not(".ui-page #content .slide").each(function() {
  $(this).attr('id','slide'+slideNo);
  slideNo = slideNo + 1;
});

/* ** basic variables ** */
window.howManySlides = $('.slide').not(".slideOverlay .slide").not(".ui-page #content .slide").length;
window.currentSlide = 1;


	
/* ****************************************** CREATE PAGINATION **************************************************************** */

if ( window.howManySlides > 1)
{

sectionMenu = $('#sectionMenu').html();

/*holder*/

$('body').prepend('<div class="pagination"><div class="pagination2"></div></div>');
$('.pagination2').prepend('<div class="paginationBacktotop" onclick="backtotopSlide();"></div><div class="paginationUpSlide" onclick="upSlide();"></div><div class="paginationDots"></div><div class="paginationDownSlide" onclick="downSlide();"></div>');

/*pages*/
slideNo = 1;

for ( var i = 1; i < window.howManySlides + 1; i++ ) 
	{
	$('.paginationDots').append('<div></div>');	
	}

}

/* hide if top */	

var scrollPos = $(window);
var scrollPosPercent = scrollPos.scrollTop() / $(window).height() * 100;

if ( scrollPosPercent == 0  )
{
$('.paginationBacktotop').addClass('paginationHide');
$('.paginationUpSlide').addClass('paginationHide');
}

finalslide = window.howManySlides *100 -100

if ( scrollPosPercent == finalslide  )
{
$('.paginationDownSlide').addClass('paginationHide');
}



/*slide waypoints for pagination*/

/* ** set initial pagination ** */
pagination();


	
var startScroll = $(window).scrollTop();
var slideOffsets = [];
var activeSlide =0;

$( ".slide" ).not(".slideOverlay .slide").each(function( index ) {
	slideOffsets.push($(this).offset().top);
	if($(this).offset().top == $("body").scrollTop())
		{activeSlide = index}
			});

/* ****************************************** SEARCH focus out + key input **************************************************************** */

	$( '#searchInput' ).focusout(function() {
		$('#search').removeClass('open');
		$('.searchButton').attr('src','/000uber/03images/01header/search.png');
		$('.searchClose').hide();
		$('#searchInput').val('');
	})

	$( '#searchInput' ).keypress(function() {
		$('.searchClose').show();
	});
	
	
	
/* ****************************************** Login **************************************************************** */	
	mm_login.init();
	
	$("#OBExtSubmit").on( "click", function(event) {
		event.preventDefault();
		overlayPanelOpen(event, "altLoginPanel");
	});	
	
	$("#OBSubmit").on( "click", function(event) {
		event.preventDefault();
		mm_login.checkForm(event);
		});
	
	$("#APPSubmit").on( "click", function(event) {
		event.preventDefault();
		window.location.href="ui://ui.check.pairing.status.entity.controller";
		});
	
	$("#mobiSubmit").on( "click", function(event) {
		event.preventDefault();
		window.location.href= $('#domainInfo').attr('data-bnkng') +"/banking/?_ismobi=true";
		});
	
	
	
	
	
	/* ***************************** LOGIN OVERLAY ***************************** */
	function overlayLoginSubmit(event) {
		event.preventDefault();
		$('#user').val($('#OverlayUsername').val())
		$('#pass').val($('#OverlayPassword').val())
		mm_login.checkForm(event);
		
	}
	$("#overlayloginButton").on( "click", function(event) {
		overlayLoginSubmit(event);
	});
	
	
	
	if(window.location.pathname == "/index.html" || window.location.pathname == "/")
	{}
	
	


/* ****************************************** CLICK TRACKING **************************************************************** */	
	$("[data-trackclick]").click(function(){
		var obj = this;
		var trackType = $(obj).attr("data-trackclick");
		var pageInfo = $("#pageInfo");
		if (pageInfo.attr("data-pname") !== undefined) {
			var title = pageInfo.attr("data-pgroup") + "/" + pageInfo.attr("data-psegment") + "/" + pageInfo.attr("data-pname");
			var wrapper = $(obj).closest(".overlay");
			if(wrapper.length == 0){
				wrapper = $(obj).closest(".slide");
			}
			var wrapperId = ""; 
			if ( wrapper[0] !== undefined) {
				wrapperId = wrapper[0].id; 
			}
			else if (wrapper.id !== undefined) {
				wrapperId = wrapper.id; 
			}
			else {
				wrapperId = "Page"; 
			}
			
			var ctext =  obj.textContent.trim();
			if (trackType == 'demoLink') {
				var theTable = $(this).closest('table');
				var colIdx = $(this).closest('td').index();
				var colDesc = $(theTable).find("tr td.track-X:eq('"+colIdx+"')");
				var rowDesc = rowDesc = $(this).closest('tr').find('td.track-Y');

//				submitTracking(title + "," + wrapperId + "," + trackType + " - " +colDesc[0].textContent.trim()+ "/" + rowDesc[0].textContent.trim().replace(',',' '));
				submitTracking(title, wrapperId, trackType + " - " +colDesc[0].textContent.trim()+ "/" + rowDesc[0].textContent.trim().replace(',',' '));
			}
			else if (ctext == '') {
				ctext = $(obj).find("img").attr("alt");
				submitTracking(title + "," + wrapperId + "," + trackType +" - "+ctext.replace(',',' '));
				submitTracking(title, wrapperId, trackType +" - "+ctext.replace(',',' '));
			}
			else {
				submitTracking(title, wrapperId, trackType +" - "+ctext.replace(',',' '));
				
			}
			
		}
//			submitTracking($(this).attr("data-trackclick"));
	});
	
});//close doc ready

/* ****************************************** SEARCH open close **************************************************************** */

function search() 
{
	$('#search').addClass('open');
	$('.searchButton').attr('src','/000uber/03images/01header/search2.png');
	
	setTimeout(function() {
      $( "#searchInput" ).focus();
	}, 500);	

}





/* ****************************************** PAGINATION**************************************************************** */
/* pagination highlight function */

function pagination() 
{
$('.pagination div').removeClass('active');
$('.pagination div:nth-child('+ window.currentSlide +')').addClass('active');
}

/* ****************************************** SHOW HIDE SECTION MORE BUTTON **************************************************************** */

function moreButton33(obj,target) 
{
var visibility = $(obj).attr('data-visibility');
	if (visibility == 'hidden')
	{
	$('.homePageSegmentSelector').addClass('hideSection');
	$('.iconButton').find('span').find('.expandArrow').remove();
	$('.iconButton').attr('data-visibility','hidden');	
	
	$('.'+target).removeClass('hideSection');
	$(obj).attr('data-visibility','notHidden');
	//$(obj).find('span').html('<img src="/000uber/03images/00icons/temp/icon_less.png">Less<div class="expandArrow"></div>');
	$(obj).find('span').append('<div class="expandArrow"></div>');
	}
	else
	{
	$('.'+target).addClass('hideSection');
	$(obj).attr('data-visibility','hidden');	
	//$(obj).find('span').html('<img src="/000uber/03images/00icons/temp/icon_more.png">More');
	$(obj).find('.expandArrow').remove();
	}
}



/* ****************************************** IMAGE IN OVERLAY **************************************************************** */

function displayImageInOverlay(event, selector, imageSource, sourceID) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;

	$("#"+sourceID+"Image").addClass("column sectionColThirds");
	$("#"+sourceID+"Image").html("<img src='"+imageSource+"' width='80%' />");
	$("#"+sourceID+"Content .sectionColFull").removeClass("sectionColFull").addClass('sectionColTwoThirds');
}


/* ****************************************** GENERIC PANEL OVERLAY **************************************************************** */

function overlayPanelOpen(event, selector, highlight) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	//stop main content from scrolling
	
	$('body').addClass('bodyNoScroll');
	//$('body, html').addClass('bodyNoScroll');
		
	//unhide overlayPanel + overlayPanel back
	$('.overlayPanel.'+selector).removeClass('overlayPanelHide');
	$('.overlayPanelBack.'+selector).removeClass('overlayPanelHide');
	
	//if a carousel is in the overlayPanel
	//find it
	carousel = $('.overlayPanel.'+selector).find('.slick-slider').attr('id');
	
	//refresh it	
	$('#'+carousel).slick('setPosition');
	
	if (highlight == 'undefined')
	{
	}
	else
	{
		$( ".menuWidgetLeft a" ).each(function( index ) {
			$(this).removeClass('menuActive');
		});	
		$('.menuWidgetLeft a:contains("'+highlight+'")').addClass('menuActive');	
	}
	var videoPlayer = $("#" + selector + "Content").find('.video');
	if($(videoPlayer).length){
		$(videoPlayer)[0].play();
	}
	
}

function overlayPanelClose(event) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	//start main content scrolling
	$('body, html').removeClass('bodyNoScroll');
		
	//remove any elements from multi overlayPanel
	$('.overlayPanel').removeClass('overlaymoveLefttToFurtherLeft');
	$('.overlayPanel').removeClass('overlaymoveRightToCenter');
	$('.overlayPanel').removeClass('overlayMoveCenterToLeft');	
	$('.overlayPanel').removeClass('overlaymoveLefttToCenter');
	$('.overlayPanel').removeClass('overlayMoveCenterToRight');
	
	//hide overlayPanel + overlayPanel back
	$('.overlayPanel').addClass('overlayPanelHide');
	$('.overlayPanelBack').addClass('overlayPanelHide');
	
	//video
    var video = $(".video");
    if (video.length > 0 )
    { video.each(function( index ) {
    	video[index].pause();
    });
    }
	
}





/* ****************************************** MULTI OVERLAY NAV **************************************************************** */

function overlayMulti(event, obj, selector, highlight ) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	//unhide target overlay
	$('.overlay.'+selector).removeClass('overlayHide');
	$('.overlayBack.'+selector).removeClass('overlayHide');
	
	//move any left overlays further left - only if not already further left
    $('.overlayMoveCenterToLeft').not('.overlayMoveCenterToLeft.overlaymoveLefttToFurtherLeft').addClass('overlaymoveLefttToFurtherLeft');
    $('.overlaymoveLefttToFurtherLeft').closest('.overlay').removeClass('overlayMoveCenterToLeft');
	
	//set target to the right of screen
    $(obj).closest('.overlay').removeClass('overlaymoveCentertoRight');
    $('.overlay.'+selector).addClass('overlaymoveRightToCenter');
	
	//move current overlay to the left of screen
    $(obj).closest('.overlay').removeClass('overlaymoveRightToCenter');
    $(obj).closest('.overlay').removeClass('overlaymoveLefttToCenter');
	$(obj).closest('.overlay').addClass('overlayMoveCenterToLeft');
	
	//'close' button	
	//get class of current overlay to add to back button	
	var classOfTarget = $(obj).closest('.overlay').attr('class');
	var classOfTargetSplit = classOfTarget.split(' ');
	
	//generate 'close' button	
	$('.overlay.'+selector).closest('.overlay').find('.overlayBackButtonHolder .sectionColInner').html('<a href="#" class="link  arrowButtonBack vAlignMiddle " onclick="overlayMultiBack(event, this,\''+classOfTargetSplit[1]+'\');">Back</a>');
	
	if (highlight == 'undefined')
	{
		//alert('no '+highlight)
	}
	else
	{
		//alert('yes '+highlight)
		$( ".menuWidgetLeft a" ).each(function( index ) {
			$(this).removeClass('menuActive');
		});	
		$('.menuWidgetLeft a:contains("'+highlight+'")').addClass('menuActive');	
	}
			
}

function overlayMultiBack(event, obj, selector ) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	//move target left to center
	if ( $('.overlay.'+selector).hasClass('overlaymoveLefttToFurtherLeft'))
	{
	$('.overlay.'+selector).removeClass('overlaymoveLefttToFurtherLeft');
	$('.overlay.'+selector).addClass('overlaymoveLefttToCenter');
	}
	else
	{
	$('.overlay.'+selector).removeClass('overlayMoveCenterToLeft');
	$('.overlay.'+selector).addClass('overlaymoveLefttToCenter');
	}
	
	//move current center to right
	$(obj).closest('.overlay').removeClass('overlaymoveLefttToCenter');
	$(obj).closest('.overlay').removeClass('overlaymoveRightToCenter');
	$(obj).closest('.overlay').addClass('overlaymoveCentertoRight');
	$('.overlay.'+selector).removeClass('overlayHide');
	$('.overlayBack.'+selector).removeClass('overlayHide');
	
	//hide current
	setTimeout(function(){
	$(obj).closest('.overlay').removeClass('overlaymoveCentertoRight');
	$(obj).closest('.overlay').addClass('overlayHide').prev(".overlayBack").addClass('overlayHide');
	}, 1000);

}

function overlayShowHide(event, selector) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	$('.overlayBack').addClass('overlayHide');
	$('.overlay').addClass('overlayHide');
	$('.'+selector).removeClass('overlayHide');
		
	return false;
}



var menuSegment="Personal";
var menuPillar="DailyBanking";


function menuOverlay(event,overlayType ,overlay,stage,segment, pillar ) 
{


	if(segment != "")
		{menuSegment = segment;}
	if(pillar != "")
	{menuPillar = pillar;}
	
	
	
	if(overlay != '' && overlayType == "multi")
		{
		overlayMulti(event,event.currentTarget, overlay ) ;
		}
	else
	if(overlay != '' && overlayType == "single")
	{
		overlayOpen(event, overlay ) ;	
	}

	
	$(".widgetLeftMenu").removeClass("menuActive");
	$(".menuBanking").removeClass("menuActive");


	if(menuPillar != '')
	{
		
		var _this = $(".menuWidgetLeft ."+menuPillar);
		var _parent = _this.closest(".widgetLeftMenu");

			
		_parent.closest(".sectionColThirds").attr("id","");   
		_parent.closest(".sectionColThirds").attr("id",menuSegment);
		var menuSeg = "."+menuSegment;
		
		if(menuSegment != "Generic")
			{$(".widgetLeftMenu.Generic").addClass("menuActive");}
		


		$(".widgetLeftMenu"+menuSeg).addClass("menuActive");
		$(".menuBanking"+menuSeg+"."+menuPillar).addClass("menuActive");


		$(".menuWidgetLeft").find("a").removeClass("menuActive");	
		$(".menuWidgetLeft ."+menuPillar).addClass("menuActive");	

		
		
		
	}
	
	$(".rowButtonSmall").on("click", function(event){
		
		
		var _this = $(this);
		var _parent = _this.closest(".widgetLeftMenu");
		
		if(_this.attr("href") == "" || _this.attr("href") == "#")
		{event.preventDefault();}
		
		$(".menuWidgetLeft").find("a").removeClass("menuActive");	
		$(".menuBanking").removeClass("menuActive");
		_this.addClass("menuActive");
		var pillar = _this.attr("data-pillar");
		var menuSeg = "."+menuSegment;
		if(_parent.hasClass("Generic"))
			{menuSeg = ".Generic";}
		$(".menuBanking"+menuSeg+"."+pillar).addClass("menuActive");
		
	})

}



/* ****************************************** GENERIC OVERLAY **************************************************************** */

function overlayOpen(event, selector, highlight) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	//stop main content from scrolling
	$('body, html').addClass('bodyNoScroll');
		
	//unhide overlay + overlay back
	$('.overlay.'+selector).removeClass('overlayHide');
	$('.overlayBack.'+selector).removeClass('overlayHide');
	
	//if a carousel is in the overlay
	//find it
	carousel = $('.overlay.'+selector).find('.slick-slider').attr('id');
	
	//refresh it	
	$('#'+carousel).slick('setPosition');
	
	if (highlight == 'undefined')
	{
	}
	else
	{
		$( ".menuWidgetLeft a" ).each(function( index ) {
			$(this).removeClass('menuActive');
		});	
		$('.menuWidgetLeft a:contains("'+highlight+'")').addClass('menuActive');	
	}
}

function overlayClose(event) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	//start main content scrolling
	$('body, html').removeClass('bodyNoScroll');
		
	//remove any elements from multi overlay
	$('.overlay').removeClass('overlaymoveLefttToFurtherLeft');
	$('.overlay').removeClass('overlaymoveRightToCenter');
	$('.overlay').removeClass('overlayMoveCenterToLeft');	
	$('.overlay').removeClass('overlaymoveLefttToCenter');
	$('.overlay').removeClass('overlayMoveCenterToRight');
	
	//hide overlay + overlay back
	$('.overlay').addClass('overlayHide');
	$('.overlayBack').addClass('overlayHide');
	
}





/* ****************************************** MULTI PANEL NAV **************************************************************** */

function overlayPanelMulti(event, obj, selector, highlight ) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	$('.overlayPanelBack.'+selector).removeClass('overlayPanelBack');
	
	//unhide target overlay
	$('.overlayPanel.'+selector).removeClass('overlayPanelHide');
	$('.overlayPanelBack.'+selector).removeClass('overlayPanelHide');
	
	//if a carousel is in the overlayPanel
	//find it
	carousel = $('.overlayPanel.'+selector).find('.slick-slider').attr('id');
	
	//refresh it	
	$('#'+carousel).slick('setPosition');
	
	//move any left overlays further left - only if not already further left
    $('.overlayMoveCenterToLeft').not('.overlayMoveCenterToLeft.overlaymoveLefttToFurtherLeft').addClass('overlaymoveLefttToFurtherLeft');
    $('.overlaymoveLefttToFurtherLeft').closest('.overlay').removeClass('overlayMoveCenterToLeft');
	
	//set target to the right of screen
    $(obj).closest('.overlayPanel').removeClass('overlaymoveCentertoRight');
    $('.overlayPanel.'+selector).addClass('overlaymoveRightToCenter');
	
	//move current overlay to the left of screen
    $(obj).closest('.overlayPanel').removeClass('overlaymoveRightToCenter');
    $(obj).closest('.overlayPanel').removeClass('overlaymoveLefttToCenter');
	$(obj).closest('.overlayPanel').addClass('overlayMoveCenterToLeft');
	
	//'close' button	
	//get class of current overlayPanel to add to back button	
	var classOfTarget = $(obj).closest('.overlayPanel').attr('class');
	var classOfTargetSplit = classOfTarget.split(' ');
	
	//generate 'close' button	
	$('.overlayPanel.'+selector).closest('.overlayPanel').find('.overlayPanelBackButtonHolder .sectionColInner').html('<a href="#" class="link  arrowButtonBack vAlignMiddle " onclick="overlayPanelMultiBack(event, this,\''+classOfTargetSplit[1]+'\');">Back</a>');
	
	if (highlight == 'undefined')
	{
		//alert('no '+highlight)
	}
	else
	{
		//alert('yes '+highlight)
		$( ".menuWidgetLeft a" ).each(function( index ) {
			$(this).removeClass('menuActive');
		});	
		$('.menuWidgetLeft a:contains("'+highlight+'")').addClass('menuActive');	
	}
	
	var videoPlayer = $("#" + selector + "Content").find('.video');
	if($(videoPlayer).length){
		$(videoPlayer)[0].play();
	}
			
}

function overlayPanelMultiBack(event, obj, selector ) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	//move target left to center
	if ( $('.overlayPanel.'+selector).hasClass('overlaymoveLefttToFurtherLeft'))
	{
	$('.overlayPanel.'+selector).removeClass('overlaymoveLefttToFurtherLeft');
	$('.overlayPanel.'+selector).addClass('overlaymoveLefttToCenter');
	}
	else
	{
	$('.overlayPanel.'+selector).removeClass('overlayMoveCenterToLeft');
	$('.overlayPanel.'+selector).addClass('overlaymoveLefttToCenter');
	}
	
	if ( $('.overlayPanel.'+selector).hasClass('overlayMoveCenterToLeft'))
		{
		$('.overlayPanel.'+selector).removeClass('overlayMoveCenterToLeft')
		}
	
	//video
    var video = $(".video");
    if (video.length > 0 )
    { video.each(function( index ) {
    	video[index].pause();
    });
    }
	
	//move current center to right
	$(obj).closest('.overlayPanel').removeClass('overlaymoveLefttToCenter');
	$(obj).closest('.overlayPanel').removeClass('overlaymoveRightToCenter');
	$(obj).closest('.overlayPanel').addClass('overlaymoveCentertoRight');
	$('.overlayPanel.'+selector).removeClass('overlayHide');
	$('.overlayPanelBack.'+selector).removeClass('overlayHide');
	
	//hide current
	setTimeout(function(){
	$(obj).closest('.overlayPanel').removeClass('overlaymoveCentertoRight');
	$(obj).closest('.overlayPanel').addClass('overlayPanelHide').prev(".overlayBack").addClass('overlayPanelHide');
	}, 1000);

}

function overlayShowHide(event, selector) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	$('.overlayPanelBack').addClass('overlayHide');
	$('.overlayPanel').addClass('overlayHide');
	$('.'+selector).removeClass('overlayHide');
		
	return false;
}



var menuSegment="Personal";
var menuPillar="DailyBanking";


function menuOverlay(event,overlayType ,overlay,stage,segment, pillar ) 
{


	if(segment != "")
		{menuSegment = segment;}
	if(pillar != "")
	{menuPillar = pillar;}
	
	
	
	if(overlay != '' && overlayType == "multi")
		{
		overlayMulti(event,event.currentTarget, overlay ) ;
		}
	else
	if(overlay != '' && overlayType == "single")
	{
		overlayOpen(event, overlay ) ;	
	}

	
	$(".widgetLeftMenu").removeClass("menuActive");
	$(".menuBanking").removeClass("menuActive");


	if(menuPillar != '')
	{
		
		var _this = $(".menuWidgetLeft ."+menuPillar);
		var _parent = _this.closest(".widgetLeftMenu");

			
		_parent.closest(".sectionColThirds").attr("id","");   
		_parent.closest(".sectionColThirds").attr("id",menuSegment);
		var menuSeg = "."+menuSegment;
		
		if(menuSegment != "Generic")
			{$(".widgetLeftMenu.Generic").addClass("menuActive");}
		


		$(".widgetLeftMenu"+menuSeg).addClass("menuActive");
		$(".menuBanking"+menuSeg+"."+menuPillar).addClass("menuActive");


		$(".menuWidgetLeft").find("a").removeClass("menuActive");	
		$(".menuWidgetLeft ."+menuPillar).addClass("menuActive");	

		
		
		
	}
	
	$(".rowButtonSmall").on("click", function(event){
		
		
		var _this = $(this);
		var _parent = _this.closest(".widgetLeftMenu");
		
		if(_this.attr("href") == "" || _this.attr("href") == "#")
		{event.preventDefault();}
		
		$(".menuWidgetLeft").find("a").removeClass("menuActive");	
		$(".menuBanking").removeClass("menuActive");
		_this.addClass("menuActive");
		var pillar = _this.attr("data-pillar");
		var menuSeg = "."+menuSegment;
		if(_parent.hasClass("Generic"))
			{menuSeg = ".Generic";}
		$(".menuBanking"+menuSeg+"."+pillar).addClass("menuActive");
		
	})

}


/* ****************************************** SLIDE CONTROLS **************************************************************** */

function downSlide() 
{	

	var scrollPos = $(window);
	var scrollPosPercent = scrollPos.scrollTop() / $(window).height() * 100;
	
		
	if ( scrollPosPercent > -1 && scrollPosPercent < 100)
		{	
			scrollToPos = $(window).height() * 1;
		}
	else if ( scrollPosPercent > 99 && scrollPosPercent < 200 )
		{	
			scrollToPos = $(window).height() * 2;
		}
	else if ( scrollPosPercent > 199 && scrollPosPercent < 300 )
		{	
			scrollToPos = $(window).height() * 3;
		}
	else if ( scrollPosPercent > 299 && scrollPosPercent < 400 )
		{	
			scrollToPos = $(window).height() * 4;
		}
	else if ( scrollPosPercent > 399 && scrollPosPercent < 500 )
		{	
			scrollToPos = $(window).height() * 5;
		}
	else if ( scrollPosPercent > 499 && scrollPosPercent < 600 )
		{	
			scrollToPos = $(window).height() * 6;
		}
	else if ( scrollPosPercent > 599 && scrollPosPercent < 700 )
		{	
			scrollToPos = $(window).height() * 7;
		}
	else if ( scrollPosPercent > 699 && scrollPosPercent < 800 )
		{	
			scrollToPos = $(window).height() * 8;
		}		
		
	$('html, body').animate({
		scrollTop: scrollToPos
	}, 500);
			
}

function upSlide() 
{	

	var scrollPos = $(window);
	var scrollPosPercent = scrollPos.scrollTop() / $(window).height() * 100;
	
		
	if ( scrollPosPercent >= 0 && scrollPosPercent < 99)
		{	
			scrollToPos = 0;
		}
	else if ( scrollPosPercent >= 100 && scrollPosPercent < 199 )
		{	
			scrollToPos = 0;
		}
	else if ( scrollPosPercent >= 200 && scrollPosPercent < 299 )
		{	
			scrollToPos = $(window).height() * 1;
		}
	else if ( scrollPosPercent >= 300 && scrollPosPercent < 399 )
		{	
			scrollToPos = $(window).height() * 2;
		}
	else if ( scrollPosPercent >= 400 && scrollPosPercent < 499 )
		{	
			scrollToPos = $(window).height() * 3;
		}
	else if ( scrollPosPercent >= 500 && scrollPosPercent < 599 )
		{	
			scrollToPos = $(window).height() * 4;
		}
	else if ( scrollPosPercent >= 600 && scrollPosPercent < 699 )
		{	
			scrollToPos = $(window).height() * 5;
		}
	else if ( scrollPosPercent >= 700 && scrollPosPercent < 799 )
		{	
			scrollToPos = $(window).height() * 6;
		}	
	else if ( scrollPosPercent >= 800 && scrollPosPercent < 899 )
		{	
			scrollToPos = $(window).height() * 7;
		}		
		
	$('html, body').animate({
		scrollTop: scrollToPos
	}, 500);
			
}


function backtotopSlide() 
{	
		
	$('html, body').animate({
		scrollTop: 0
	}, 500);
			
}

function submitTracking(category,action,label,value) 
{	
	if (typeof dataLayer  !== 'undefined') {
		dataLayer.push({
	        'event':'trackEvent',
	        'eventCategory': category,
	        'eventAction': action,
	        'eventLabel': label,
	        'eventValue': value //Numerical value for event
	    });
	}
	else {
		/*console.log("GTM undefined");*/
	}
}


function submitFormFromLink(action, form){
	//Select form
	var loginForm = $('#'+form);
	//Get banking utl
	var environment = $("#bankingUrl").val();
	environmentStr = environment.toString();
	//Update form action
	loginForm.attr('action',environmentStr + "/banking/main.jsp");
	//Change form target
	loginForm.attr('target',"_top");
	//Enable dimple input field for submittion
	if (action == 'verifyRemAdv') {
		fnb.hyperion.$("#simple").disabled = false;
	}
	//Update form action
	$('#formAction').val(action);
	//Update nav value
	$('#nav').val(action);
	//Submit form
	loginForm.submit();
}

function simpleAjax(destination,targetUrl){
    $.ajax({
           type: "GET",
           url: targetUrl,
           dataType:'html',
           cache: false,
           beforeSend : function (jqXHR){},
           complete : function (jqXHR, textStatus) {       },
           success: function(data, textStatus, jqXHR) {
                  $(destination).html(data).find("#ui-utilityPage").contents().unwrap();
                  $(destination).contents().unwrap();
           }
    });
}

function loadWidget(destination,targetUrl,redirectjsp,pageSuffix){
	$.ajax({
		type: "POST",
		url: targetUrl,
		dataType:'html',
		data: {returnScreen:redirectjsp, pageSuffix:pageSuffix},
		cache: false,
		beforeSend : function (jqXHR){},
		complete : function (jqXHR, textStatus) {       },
		success: function(data, textStatus, jqXHR) {
			$(destination).html(data).find("#widgetBody").contents().unwrap();
		}
	});
}

function load(event,destination,targetUrl){
	event.preventDefault();
	$.ajax({
		type: "POST",
		url: targetUrl,
		dataType:'html',
		cache: false,
		beforeSend : function (jqXHR){
			$(destination).empty();
			$(destination).addClass("loading");
		},
		complete : function (jqXHR, textStatus) {
			$(destination).removeClass("loading");
		},
		success: function(data, textStatus, jqXHR) {
			$(destination).html(data);
		}
	});
}

function loadPanel(event, targetUrl, multi, panel){
	event.preventDefault();
	obj = event.currentTarget;
	var openPanel = panel;
	if(panel == '' || panel == null){
		openPanel = 'dynBuiltPanel';
	}
	$.ajax({
		type: "POST",
		url: targetUrl,
		dataType:'html',
		cache: false,
		beforeSend : function (jqXHR){
			$('#dynBuiltPanels').empty();
			$('body').addClass("loading");
		},
		complete : function (jqXHR, textStatus) {
			$('body').removeClass("loading");
			if (multi) {
				overlayPanelMulti(event, obj, 'dynBuiltPanel');
			}
			else {
				overlayPanelOpen(event, openPanel);	
			}
		},
		success: function(data, textStatus, jqXHR) {
			$('#dynBuiltPanels').html(data);
		}
	});
}

function submitForm(obj,event,destination){
	var destination = destination;
	if(typeof destination === null || typeof destination === undefined) {
		destination = obj;
	}
	if(event != null && event != undefined) {
		event.preventDefault ? event.preventDefault() : event.returnValue = false;
	}
	if(typeof obj === "object") {
		var form = $("#"+obj.id).get(0);
	}
	else {
		var form = $("#"+obj).get(0);
	}
	
	//Strip commas from currency fields
	$(".glCurrency").each(function(){
		currentVal = $(this).val();
		$(this).val(currentVal.replace(/,/g, ''));
	});

	//Fields to be added to comments field
	var comments = document.getElementById('contactHCWHY');
	if (comments !== null && comments !== undefined) {
		var holdValue = document.getElementById('contactHCWHY').value;
		if(holdValue.lastIndexOf("|") > 0){
			holdValue = holdValue.substr(holdValue.lastIndexOf("| ") + 1);
		}
		var attachToComments = "";
		$(".glATC").each(function(){
			attachToComments = attachToComments + this.value + " | ";
		});
		comments.value = attachToComments + holdValue;
	}
	
	$.ajax({
		type: "POST",
		url: form.action,
		dataType:'html',
		data: $(form).serialize(),
		cache: false,
		beforeSend : function (jqXHR){},
		complete : function (jqXHR, textStatus) {},
		success: function(data) {
			var txtErrors = document.createElement("div");  // Create with DOM
		    var errors = $(txtErrors).html(data).find('backend_errors').contents().unwrap();
		    
		    var tar = document.createElement("div");  // Create with DOM
		    var newHTML = $(tar).html(data).find("#widgetBody").contents().unwrap();

			//re-enable submit button.
			validationStat = false;
			$('#submitBtn').removeClass('disabled');
			$('#'+destination).removeClass("loading");
			
		    if(errors.length > 0 && errors[0].textContent != '') {
				serverSideValidation(errors[0].textContent);
			}
		    else {
		    	$("#"+destination).html(newHTML);
		    	scrollTo('#results');
		    }

		}
	});
}

function showView(event, obj, selector) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	var viewsButton = $(obj); 
	$(".viewsButton.viewsButtonActive").removeClass("viewsButtonActive");
	viewsButton.addClass("viewsButtonActive");
	
	showSpecificWithinFamily(event, obj, '', '.view', selector); 
	
}

function showSpecificWithinFamily(event, obj, family, selector, uid) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	
	var f = $(family +" "+ selector);
	hideSpecificWithinFamily(event, obj, family, selector);
	
	if (f.length > 1) {
		if(typeof uid === 'number') {
			$(f[uid]).removeClass('hidden');
		}
		else {
			$(uid).removeClass('hidden');
		}
	}
	else {
		$(f).removeClass('hidden');
	}
}

function hideSpecificWithinFamily(event, obj, family, selector) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	if(family == '') {
		if (selector.indexOf(".") == -1) {
			$(selector).siblings().addClass('hidden');
		}
		else {
			$(selector).siblings(selector).addClass('hidden');
		}
	}
	else {
		$(family +" "+ selector).siblings().addClass('hidden');
	}
}

function call(fnc,pre,post) {
	if( typeof pre === "function" )	{
		if (pre()) {
			if( typeof fnc === "function" )	{
				if (fnc()) {
					if( typeof post === "function" ) return post();
				}
				
			}
		}	
	}
	else {
		if( typeof fnc === "function" )	{
			if (fnc()) {
				if( typeof post === "function" ) return post();
			}
		}
		
	}
}

function predictiveText(event, obj, arr, dest, submit, nav) 
{
	event.preventDefault();
	
	var values = "";
	if (arr !== null && arr != '') {
		values = arr;
	}
	
	var code = event.keyCode || event.which;
	 if(code == 13) { //Enter keycode
		/*console.info("Enter keycode");*/
		$(obj).closest("form").trigger("submit");
		$(obj).closest(".predictable").removeClass('predictable');
		return true;
	 }

	 if(obj.value.length >= 3) {

		if (nav !== undefined && nav != '' ) {
			//Do ajax call to get values
			$.ajax({
				type: "POST",
				url: '/Controller?nav='+nav+obj.value,
				dataType:'html',
				cache: false,
				beforeSend : function (jqXHR){},
				complete : function (jqXHR, textStatus) {
				},
				success: function(data, textStatus, jqXHR) {
					values = data.trim().split("|");
					buildPredictiveTextOptions(event, obj, dest, values);
				}
			});
		}
		else {
			buildPredictiveTextOptions(event, obj, dest, values, submit);
		}
		
	}
	 else {
		$(obj).closest(".predictable").removeClass('predictable');
	 }
}

function buildPredictiveTextOptions(event, obj, dest, values, submit) {
	var parent = $(event.target).parent(); 
	if (!parent.hasClass('predictable')) {
		$(obj).blur(function(event){
			$(event.target).parent().removeClass('predictable');
			$(obj).unbind( "blur" );
		});
		parent.addClass('predictable');
	}
	
	$('#predictive_'+dest).remove();
	query = obj.value;
	if(query != '') {
		filtered = $.grep(values, function(a){
			return a.toUpperCase().indexOf(query.toUpperCase()) >=0;
		});
		
		var new_node = document.createElement('div');
		new_node.id = "predictive_"+dest;
		
		for(var i=0; i< filtered.length; i++) {
			var new_node2 = document.createElement('div');
			new_node2.innerHTML = filtered[i].replace(new RegExp(query, "gi"), "<b>"+query+"</b>");
			new_node2.setAttribute("data-value",filtered[i]);
			$(new_node2).appendTo(new_node);
		}
		
		$(obj).after(new_node);
		$(new_node).addClass('predictions');
		$('.predictions > div').click(function(event){
			event.stopImmediatePropagation();
			obj.value = event.currentTarget.getAttribute("data-value");
			if(submit) {
				$(obj).closest("form").trigger("submit");
			}
			$(obj).closest(".predictable").removeClass('predictable');
		});
	
	}
		

	
}


function showHideElements(showElement , hideElement ,  parent) 
{	
		if(parent != '')
		{
			var elementToShow = $(parent).find(showElement);
			var elementToHide = $(parent).find(hideElement);
		}
		else
		{
			var elementToShow = $(showElement);
			var elementToHide = $(hideElement);
			}	
		
		elementToHide.removeClass("active").addClass("inactive");
		elementToShow.removeClass("inactive").addClass("active");
		
			
}

function simpleShowHide(event,selector,selector2,me) 
{
	//prevent default
	event.preventDefault ? event.preventDefault() : event.returnValue = false;
	$(me).parent().find('.iconSideButton').removeClass('highlightButton');
	$(me).addClass('highlightButton');
	$('.'+selector).addClass('simpleHide');
	$('.'+selector2).removeClass('simpleHide');

	return false;
}

function capsLock() 
{
	var hostStr = window.location.host;
		
   	if(navigator.platform.indexOf('Win') > -1 && (hostStr.indexOf("fnb.co.za") > -1  || hostStr.indexOf("rmbprivatebank") > -1)){
		
		$('head').append('<style type="text/css">.alertMsg.displayAlert{display:block;} .alertMsg{display:none;width: 25px;position: absolute;top: 22px;border: 1px solid #FF9900;background: #FF9900;z-index: 2;background-image: url(/00Assets/v2.2/images/icons/generic/capslock.svg);background-repeat: no-repeat;height: 18px;background-position: center center;border-radius: 12px;left: 10px;background-size: 18px;}</style>');
    	$( ".loginFields :input, .loginPanel :input" ).on( "keyup", function() {
  		  $(this).each(function() {
  				if (event.getModifierState("CapsLock")) {
  					switch($('html').attr("id")) {
  				  case "rmbSkin":
  					var txt1 = "<div class='alertMsg' style='top: 30px;height:18px;width:22px;'></div>";
  				    break;
  				  default:
  					var txt1 = "<div class='alertMsg' style='top: 25px;'></div>";
					if($(this).parent().hasClass("atom")){
					 txt1 = "<div class='alertMsg' style='top: 6.4rem;'></div>";	
					}
  				}
  					
  				    if($(this).parent().find(".alertMsg").length == 0 )
				    	{
  				    	$(this).parent().append(txt1).addClass("displayAlert");
  				    	$(this).parent().find(".alertMsg").addClass("displayAlert");
				    	}
  				    else{
  				    	$(this).parent().find(".alertMsg").addClass("displayAlert");
  				    }

  		  }
  				else{
  					if($(this).parent().find(".alertMsg").hasClass("displayAlert")){
  						$(this).parent().find(".alertMsg").removeClass("displayAlert");
  					}
  				}
  				
  				
  		  });
  		}).on( "blur", function() {
  			$(".loginFields, .loginPanel").find(".alertMsg").removeClass("displayAlert");

		});    		
		
	} 

	return false;
}


var mm_login = new function() {
	this.eCount = 0;
	this.formAction;
	this.multipleSubmit;
	this.isSubmitting;
	this.loginTarget;
	this.navName;
	this.navPlatform;
	this.brNum;
    this.init = function () {
    	
    	capsLock();
    	
    	this.loginTarget = $('.header');
		this.isSubmitting = false;
		
		var navName = navigator.appName ;
		var navPlatform = navigator.platform;
		var brVer = navigator.userAgent;
		var brNum;
		var reg = new RegExp('/');
		function verNumIE() {
		var brVerId = brVer.indexOf('MSIE');
		brNum = brVer.substr(brVerId,8);
		}
		function verNumOt() {
		var brVerId = brVer.search(reg);
		brNum = brVer.substring(brVerId+1);
		}
		if (navigator.appName == 'Microsoft Internet Explorer') {
		verNumIE() ;
		} else {
		verNumOt() ;
		}
		
		this.navName = navName;
		this.navPlatform = navPlatform;
		this.brNum = brNum;

		this.formAction = $('#formAction').attr('name');
		this.multipleSubmit = $('#multipleSubmit').attr('value');
		
		if(this.checkCookiesSettings()){
			//Hide Login Script 
		};

    };
    this.checkCookiesSettings = function () {
    	var cookieEnabled = (navigator.cookieEnabled) ? true : false;

	       if (typeof navigator.cookieEnabled == "undefined" && !cookieEnabled)
	       { 
	              document.cookie="CookiesAreEnabled";
	              cookieEnabled = (document.cookie.indexOf("CookiesAreEnabled") != -1) ? true : false;
	       }
	       return (cookieEnabled);
    };
    
    this.checkKey = function () {
    	var keyUnicode = event.charCode || event.keyCode;
		if(event.keyCode == 13)				
		{
			this.checkForm(event);
		}
    };
    
    this.checkForm = function (event) {
    	_this = this;
		if(this.isSubmitting!=true){
			this.isSubmitting = true;
			//this.submitLoginAnalytics();
			//to allow ie to work we cannot have a hidden variable named 'action'
			document.getElementById('formAction').name='action';
			var ret = true;
			var username = this.loginTarget.find('#user');
			var password = this.loginTarget.find('#pass');
			if ($(username).val() == "" || $(password).val() == "") {
				alert("Please complete User ID and Password");
				this.isSubmitting = false;
				return false;
			}
			document.getElementById("BrowserType").value = this.navName;
			document.getElementById("BrowserVersion").value = this.brNum;
			document.getElementById("OperatingSystem").value = this.navPlatform;
			return this.checkMultiple(event);
		}
    };
    
    this.submitFormFromLink = function (action, form) {
    	var environment = document.getElementById("bankingUrl").value;
		environmentStr = environment.toString();

		document.forms['LOGIN_FORM'].action = environmentStr + "/banking/main.jsp";
		document.forms['LOGIN_FORM'].target="_top";
		if (action == 'verifyRemAdv') {
		var simp = document.createElement('input');
		simp.setAttribute('type', 'hidden');
		simp.setAttribute('id','simple');
		simp.setAttribute('name','simple');
		simp.setAttribute('value','false');
		document.forms['LOGIN_FORM'].appendChild(simp);
		}
		document.getElementById('formAction').value=action;
		//to allow ie to work we cannot have a hidden variable named 'action'
		document.getElementById('formAction').name='action';
		document.getElementById('formname').value=form;
		document.getElementById('form').value=form;
		document.getElementById('division').value='';
		document.getElementById('nav').value=action;
		
		document.forms['LOGIN_FORM'].submit();

    };
    
    this.checkMultiple = function (event) {

		$('.overlayPanel.loginPanel, .overlayPanelBack.loginPanel').addClass("overlayPanelHide");

		this.submitLogin(event);
		return true;

    };
    
    this.submitLogin = function (event) {    
		_this = this;
    	this.submitLoginAnalytics();
    	var theForm = $(document.forms['LOGIN_FORM']);
        var extraParms = "&json=true";
        var serializedData = theForm.serialize() + extraParms;
        $("#LOGIN_FORM")[0].reset();
        $("#user").val("");
        $("#pass").val("");
        $("#OverlayUsername").val("");
        $("#OverlayPassword").val("");
        var targetURL = theForm.attr("action");
        var relativePath = targetURL.substring(targetURL.indexOf("/login"));
        setTimeout(function(){
            $.post(
                    relativePath,
                    serializedData,
                     function ( data){
                    		_this.isSubmitting = false;
                            //var resultObject = $.parseJSON(data);
                            var resultObject = data;
                            if(resultObject["errorMessage"] != ""){
									$("#exhursfl").remove();
									$("#LOGIN_FORM #tp").val("false");
									
									if(resultObject["errorMessage"].includes("Your profile has been blocked")){
										window.top.location.href = "/err/pass-err.html";
									}
	
									if (_this.eCount == 0) {
										overlayPanelOpen(event, "loginPanel");
									}
									if (_this.eCount == 1) {
										$("#loginPanel").find('#block2').append($("#loginPanel").find('#block1').detach());
										$("#loginPanel").find(".section").addClass("hHide");
										$("#loginPanel").find("#section2").removeClass("hHide");
										overlayPanelOpen(event, "loginPanel");
									}
									if (_this.eCount >= 2) {
										window.top.location.href = "/err/pass-err.html";
									}
                            		_this.eCount++;
                                    return;
                            }   
                            var redirectParameters = ""; 
                            var redirectURL = "";
                            for(k in resultObject){
                                    redirectParameters+= (k+"=" + resultObject[k]+"&");
                            }   
                            redirectParameters+="&final=true";
                            var targetURL = resultObject["bankingUrl"];
							redirectURL = resultObject["redirectURL"];

							if(redirectURL !== "")
							{

								var completeURL = redirectURL;
							}
							else{
                            var completeURL = targetURL + redirectParameters;
							}
                            
                            top.location = completeURL;


                            //$("#pageInfo").append(data);
                    }, "json"
            );  
        },200);
		//document.forms['LOGIN_FORM'].submit();

    };
    
    this.resetMultiple = function () {
    	document.getElementById("multipleSubmit").value = 0;

    };
    
    this.submitLoginAnalytics = function () {
    	submitTracking('Banking Login', $(document).attr("title"), 'Logged In');
//    	_gaq.push(['_trackEvent', 'Banking Login', $(document).attr("title"), 'Logged In']);
		//_gaq.push(['_trackEvent', 'Banking Login', 'First National Bank', 'Home']);				
		return true;

    };
    
    this.submitRegisterAnalytics = function () {
    	submitTracking('Register for Online Banking', $(document).attr("title"), 'Register');
//    	_gaq.push(['_trackEvent', 'Register for Online Banking', $(document).attr("title"), 'Register']);		
		return true;

    };
    
    this.checkLinks = function () {
    	_loginpopupoverlay.show();
		$("#login").show("fast",function(){
			$(this).removeClass("phoneHide").attr("style"," ")
			_subMenu.hide();
			$(".ui-loginOverlay .ui-popupBar").css({"height":$(window).height()+"px"});
			
		});
		$("#content").hide("fast",function(){
			//$("#loginButton").attr("value","Login");
			$(this).addClass("phoneHide").attr("style"," ");
			$("#topMenu").addClass("loginAdjust");
			$("#MM_header").addClass("loginAdjust");
		});
		
		
		$(_loginpopupoverlay.closeBtn).live("click",function(){
			$("#login").hide("fast",function(){
				$(this).addClass("phoneHide").attr("style"," ")
			});
			$("#login").attr("style"," ");
			//$("#loginButton").attr("value","");
			$("#content").show("fast",function(){
				
				$(this).removeClass("phoneHide").attr("style"," ");
				$("#topMenu").removeClass("loginAdjust");
				$("#MM_header").removeClass("loginAdjust");
			});
			
		});

    };    
    
};





function scrollTo( target ){
  var  offsetTop   = 50,
    	duration    = 500,
    	easing      = 'swing';
  
    var scrollPane = $('body');
    var scrollTarget = (typeof target == "number") ? target : $(target);
    var scrollY = (typeof target == "number") ? target : scrollTarget.offset().top + scrollTarget.scrollTop() - parseInt(offsetTop);

    scrollPane.animate({scrollTop : scrollY }, parseInt(duration), easing);
}

//New JS to vertically align the preset:block elements
$(document).ready(function(){
	var slides = $("div[id^='slide']")
	$(slides).each(function(index){
		var columns = $("div[class^='verticalAlign']")
		var slideId = index + 1;
		$(columns).each(function(index){
			var setMargin = $(this).innerHeight()/2;
			$(this).css('margin-top', '-' + setMargin + "px");
			$(this).css('top', '50%');
		});
	});
});

//Branch Date Picker
var branchBooking = (function() {
	
	var dropdowns;
	var moved = false;
	var overlay;
	var inputId;
	var dateToday;
	var chosenDay;
	var branchHours;
	var showHours;
	var today;
	var clickedDay;
	
	return {
		init : function(dateArray, overlayClass, inputId, operatingHours, departments, hoursArray) {
			showHours = hoursArray;
			
			$.each(showHours, function(key, value){
				$(value).css('opacity', 0);
			});
			
			branchHours = operatingHours;
			this.buildDepDropdown(departments);
			
			dateArray = dateArray.substring(1, dateArray.length-1);
			dateArray = dateArray.split(", ");
			overlay = overlayClass;
			dateToday = new Date();

			var d = dateToday.getDate();
		    var m = dateToday.getMonth();
		    var y = dateToday.getFullYear();
		    var maxDateHolder= new Date(y, m, d+30);
		    
			$('#' + inputId).datepicker({
				dayNamesMin: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
				numberOfMonths: 2,
		    	changeYear: false,
		    	dateFormat: "yy-mm-dd",
		    	onSelect: function(){
		    		today = new Date();
		    		clickedDay = new Date($('#' + inputId).val());
		    		
		    		today.setHours(0, 0, 0, 0);
		    		clickedDay.setHours(0, 0, 0, 0);
		    		today = today.getTime();
		    		clickedDay = clickedDay.getTime();
		    		
		    		if(today != clickedDay){
						$('#redeemAfter').hide();
					} else {
						$('#redeemAfter').show();
					}
		    		
		    		branchBooking.hideDatepicker();
		    		chosenDay = new Date($('#' + inputId).val());
		    		chosenDay = chosenDay.getUTCDay();
		    		branchBooking.populateTimes(operatingHours)
				},
				minDate: dateToday,
				maxDate: maxDateHolder,
		        beforeShowDay: function(date) {
		        	branchBooking.moveDatepicker();
		            if($.inArray($.datepicker.formatDate('yy-mm-dd', date ), dateArray) > -1)
		            {
		                return [false,"highlight","Hello"];
		            }
		            else
		            {
		                return [true,'',""];
		            }
		        	
		            
		        }
		    });
			
		    $(document).unbind('mousedown', $.datepicker._checkExternalClick);
		    $(".datePickerOverlay .closeButton").on('click', function(){
		    	$("." + overlay).hide();
		    });
		},
		
		moveDatepicker: function(){
			var dateContainer = $("#ui-datepicker-div");
			$("#ui-datepicker-div").remove();
			$("." + overlay + " .wrapper .sectionColInner").append(dateContainer);
			setTimeout(branchBooking.styleDatepicker, 0);
			$(".validationWrapper").removeClass('showToolTip');
		},
		
		hideDatepicker: function(){
			$(".datePickerOverlay").hide();
		},
		
		styleDatepicker: function(){
			$("." + overlay).show();
			$("#ui-datepicker-div").css({position: 'relative', top: '0', width: 'auto', left: '0', padding: '0 20px', 'box-shadow': 'none', border: 'none'})
		},
		
		buildDepDropdown: function(depObj){
			//reasonForVisit
			var dropOption = '';
			
			for(bd=0; bd < depObj.length; bd++){
				depObj[bd].key =  depObj[bd].key.replace(/\s/g, '');
				dropOption = dropOption + "<option id='dep" + depObj[bd].key + "' value='" + depObj[bd].key + "'>" + depObj[bd].value + "</option>"
			}
			$("#department").append(dropOption);
		},
		
		populateTimes: function(timeObj){
			for(times = 0; times < timeObj.length; times ++){
				if(chosenDay == times){
					if(timeObj[times].branchOpen == 'Closed'){
						$("#branchOpen").html(timeObj[times].branchOpen);
						$("#branchClose").html('');
					} else {
						$("#branchOpen").html(timeObj[times].branchOpen + " to ");
						$("#branchClose").html(timeObj[times].branchClose);
					}
					
					
					if(timeObj[times].tellerOpen == 'Closed'){
						$("#tellerOpen").html(timeObj[times].tellerOpen);
						$("#tellerClose").html('');
					} else {
						$("#tellerOpen").html(timeObj[times].tellerOpen + " to ");
						$("#tellerClose").html(timeObj[times].tellerClose);
					}
					
				}
			}
			$.each(showHours, function(key, value){
				$(value).css('opacity', 1);
			});
			
		}
	};

})();