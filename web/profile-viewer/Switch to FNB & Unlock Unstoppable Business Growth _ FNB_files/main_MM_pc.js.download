/* ****************************************** SMOOTH SCROLL **************************************************************** */

$(function() {
	$("a[href*='#']:not([href='#'])").click(function() {
	  if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'') && location.hostname == this.hostname) {
		var target = $(this.hash);
		target = target.length ? target : $('[name=' + this.hash.slice(1) +']');
		if (target.length) {	  
		  $('html,body').animate({
			scrollTop: target.offset().top
		  }, 500);
		  return false;
		}
	  }
	});
  });
  
  $( document ).ready(function() {
  
	  /* ****************************************** CONTACT US **************************************************************** */	
		  
	  $( ".contactLevel1" ).change(function() {
  
		  
		  selector = $(this).find(':selected').attr('value');
		  $('.contactLevel2').addClass('formHide');
		  $('.contactInfo').addClass('formHide');
		  $('.'+selector).removeClass('formHide');
		  
	  });	
  
	  $( ".contactLevel2" ).change(function() {
  
		  selector = $(this).find(':selected').attr('value');
		  $('.contactInfo').addClass('formHide');
		  $('.'+selector).removeClass('formHide');
			  
	  });
  
  
	  });
  