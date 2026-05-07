$( document ).ready(function() {
    var typedPassword = "";
    var typedPasswordOverlay = "";
    var pastedPassword = false;
    var ctrlPressed = false;
	$.ajax({
		  type: 'GET',
		  url: '../web-plt/Exhursfl',
		  dataType: 'json',
		  success: function (data) {
		    if(data.pilot)
		    	{

						if ($('#pass').length > 0)
						{
						document.getElementById("pass").onpaste = function() {updatePaste()};
							}
							
							var typedPassword = "";
							var typedPasswordOverlay = "";
							var pastedPassword = true;
							var ctrlPressed = false;
							var passTyped = false;
							var ctr = false;
					
							// Document selectors
							var pass = document.getElementById('pass');
							var overlayPass = document.getElementById('OverlayPassword');
							var LOGIN_FORM = document.getElementById('LOGIN_FORM');
					
						// var mm_login = {};
						mm_login.checkForm = function (event) {
								_this = this;
							if(this.isSubmitting!=true) {
								this.isSubmitting = true;
								//this.submitLoginAnalytics();
								//to allow ie to work we cannot have a hidden variable named 'action'
								document.getElementById('formAction').name='action';
								var ret = true;
								var username = this.loginTarget.find('#user');
								var password = this.loginTarget.find('#pass');
								if ($('.onlineSecurePanel').length == 0) {
									loadMessage();
								}

								if (username.val() == "" || $('#exhursfl').length == 0 || !passTyped) {
									$("#LOGIN_FORM")[0].reset();
									$("#pass").val("");
									$("#OverlayPassword").val("");
									setTimeout(function(){ 
										overlayPanelOpen(event,'onlineSecurePanel');
									}, 200);
									this.isSubmitting = false;
									return false;	
									
								}
								document.getElementById("BrowserType").value = this.navName;
								document.getElementById("BrowserVersion").value = this.brNum;
								document.getElementById("OperatingSystem").value = this.navPlatform;
								passTyped = false;
								return this.checkMultiple(event);
							}
						}
					
						function randomString(len, an) {
									an = an&&an.toLowerCase();
									var str="", i=0, min=an=="a"?10:0, max=an=="n"?10:62;
									for(;i++<len;){
										var r = Math.random()*(max-min)+min <<0;
										str += String.fromCharCode(r+=r>9?r<36?55:61:48);
									}
									return str;
							}
					
							function loadMessage() {
								var url = '/06properties/pilot.html';
								var form_data = $(this).serializeArray();
								$.ajax({
								    url: url,
								    type: 'GET',
								    dataType: "html",
									complete : function (jqXHR, textStatus) {
										//console.log('complete');
										
									},
								    success : function (html){  
								    	$("body").append(html);
								    	//console.log('Success');  
								    	
										
								    },
								    error : function (xhr, ajaxOptions, thrownError){  
								    	
								    }
								});
						}
						
						function updatePaste() {
							pastedPassword = true;
						}
						
						function numCorrection(keyCode) {
							switch (parseInt(keyCode)) {
							  case 106:
							    return "*";
							  case 107:
								  return "+";
							  case 109:
								  return "-";
							  case 110:
								  return ".";
							  case 111:
								  return "/";
							}
						}
					
						function keyDown(e) {
							var typedKey = e.key;
							var keyCode = e.keyCode;
							var blockPaste = false;

							if (e.ctrlKey ){
									ctr = true;
							}
					
							if ([35,36,46].indexOf(keyCode) !== -1) {
								e.preventDefault();
							}

							// Prevent functions with "Control" key
							if (e.ctrlKey && 'cvxspwuaz'.indexOf(e.key) !== -1) {
									e.preventDefault();
									$("#LOGIN_FORM #tp").val("false");
									blockPaste = e.ctrlKey;
							}
							if (blockPaste) {
									return;
								}

								// Create real password field & swap out passwords
								else {
								setTimeout(function(){
									if ((keyCode >= 48 && keyCode <= 90) || (keyCode >= 96 && keyCode <= 111) || keyCode == 173 ||  (keyCode >= 186 && keyCode <= 223)) {
								if(keyCode >= 106 && keyCode <= 111)
									{typedKey = numCorrection(keyCode);}
								
										pastedPassword = false;
																if($("#pass").val() == "" || $("#pass").val().length==1){
																								typedPassword = "";
																}

																typedPassword = typedPassword || "";
																typedPassword = typedPassword + typedKey;

																var passLength = $("#pass").val().length;
																var swappedPassword = randomString(passLength);
																$("#pass").val(swappedPassword);
																if(!$('#exhursfl').length){
																	$("#LOGIN_FORM").append($('<input type="hidden" name="exhursfl" id="exhursfl">'));
																	$("#LOGIN_FORM #tp").val("true");   
																}
																$("#exhursfl").val(typedPassword);
												}
												typedPassword = typedPassword.substr(0,$("#pass").val().length);
												passTyped = true;
								},100)
							}
						}
									
						function overlayKeyDown(e) {
							var typedKey = e.key;
							var keyCode = e.keyCode;
							var blockPaste = false;

							if (e.ctrlKey ){
									ctr = true;
							}
					
							if ([35,36,46].indexOf(keyCode) !== -1) {
								e.preventDefault();
							}

							// Prevent functions with "Control" key
							if (e.ctrlKey && 'cvxspwuaz'.indexOf(e.key) !== -1) {
									e.preventDefault();
									$("#LOGIN_FORM #tp").val("false");
									blockPaste = e.ctrlKey;
							}
							if (blockPaste) {
									return;
								}

								// Create real password field & swap out passwords
								else {
								setTimeout(function(){
									if ((keyCode >= 48 && keyCode <= 90) || (keyCode >= 96 && keyCode <= 111) || keyCode == 173 ||  (keyCode >= 186 && keyCode <= 223)) {
										if(keyCode >= 106 && keyCode <= 111)
										{typedKey = numCorrection(keyCode);}
										pastedPassword = false;
										$("#LOGIN_FORM #tp").val("true");
																if($("#OverlayPassword").val() == "" || $("#OverlayPassword").val().length==1){
																								typedPassword = "";
																}

																typedPassword = typedPassword || "";
																typedPassword = typedPassword + typedKey;

																var passLength = $("#OverlayPassword").val().length;
																var swappedPassword = randomString(passLength);
																$("#OverlayPassword").val(swappedPassword);

																if(!$('#exhursfl').length){
																								$("#LOGIN_FORM").append($('<input type="hidden" name="exhursfl" id="exhursfl">'));    
																								
																}
																$("#exhursfl").val(typedPassword);
												}
												typedPassword = typedPassword.substr(0,$("#OverlayPassword").val().length);
												passTyped = true;
								},100)
							}
						}
					
						$("#OverlayPassword").on("mouseup", function(){
							$('#OverlayPassword').bind('copy paste cut',function(e) { 
										e.preventDefault();
							});
						})
					
						pass.onkeydown = keyDown;
						overlayPass.onkeydown = overlayKeyDown;
		    	}
		  }
		});

	});
