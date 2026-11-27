CLASS /kro/cl_ui5_icf_handler DEFINITION
  PUBLIC
  CREATE PUBLIC .

  PUBLIC SECTION.

    INTERFACES if_http_service_extension .
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS /kro/cl_ui5_icf_handler IMPLEMENTATION.


  METHOD if_http_service_extension~handle_request.

    /kro/cl_ui5_http_handler=>run( req = request res = response ).

  ENDMETHOD.

ENDCLASS.
